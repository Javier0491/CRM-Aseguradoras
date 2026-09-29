-- Row Level Security por agencia.
--
-- Modelo de acceso:
-- * La aplicación (Prisma) se conecta como dueña de las tablas, a la que RLS no aplica; el
--   aislamiento de la aplicación lo hace el código (agenciaId de la sesión en cada consulta).
-- * La API REST de Supabase (roles anon y authenticated) queda SIN privilegios en todas las
--   tablas, como ya estaban usuarios, bitácora, lotes, aclaraciones y agencias. Esta migración
--   se los quita también a clientes, aseguradoras, pólizas, recibos, asegurados, matriz de
--   comisiones y _prisma_migrations, que no tenían RLS: con la llave pública (la del navegador)
--   se podían leer y modificar por la API REST.
-- * Además, cada tabla tiene políticas por agencia para el rol authenticated, basadas en el
--   claim app_metadata.agencia_id del JWT (lo escribe la app; el usuario no puede cambiarlo).
--   Son la segunda cerradura: si algún día se concede acceso por la API REST o Realtime
--   (GRANT ... TO authenticated), cada usuario solo verá su agencia. Ojo: las políticas no
--   distinguen ADMIN de EJECUTIVO (p. ej. comisiones); eso habría que añadirlo antes de abrir
--   esas tablas.

-- Agencia del JWT de la solicitud (null si no hay sesión o no trae el claim). Lee el claim
-- directamente (igual que auth.jwt()) para no depender del esquema auth.
CREATE OR REPLACE FUNCTION public.agencia_actual() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'agencia_id', '')::uuid
$$;

-- Para las políticas de Storage (bucket "expedientes", carpetas {polizaId}/): el rol
-- authenticated no puede leer polizas, así que se consulta con los permisos del dueño.
CREATE OR REPLACE FUNCTION public.poliza_de_mi_agencia(poliza_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.polizas p WHERE p.id = poliza_id AND p.agencia_id = public.agencia_actual()
  )
$$;

-- Póliza que ya no existe: sus archivos quedan huérfanos y se pueden borrar (eliminarPoliza
-- borra primero la póliza y después sus archivos, por clave exacta).
CREATE OR REPLACE FUNCTION public.poliza_eliminada(poliza_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.polizas p WHERE p.id = poliza_id)
$$;

REVOKE ALL ON FUNCTION public.poliza_de_mi_agencia(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.poliza_eliminada(text) FROM PUBLIC;

-- RLS en todas las tablas (en las que ya lo tenían no cambia nada).
ALTER TABLE "agencias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aseguradoras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "polizas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recibos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "asegurados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "esquemas_comision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bitacora" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_conciliacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lotes_cambios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notas_aclaracion" ENABLE ROW LEVEL SECURITY;

-- Los roles de Supabase no existen en la base sombra de `prisma migrate dev`.
DO $$
DECLARE
  rol text;
  tabla text;
  -- Tablas con CRUD completo dentro de la agencia.
  tablas_agencia text[] := ARRAY[
    'clientes', 'aseguradoras', 'polizas', 'recibos', 'asegurados', 'esquemas_comision',
    'lotes_conciliacion', 'lotes_cambios', 'notas_aclaracion'
  ];
BEGIN
  -- Sin privilegios para la API REST (ver arriba).
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tabla IN ARRAY tablas_agencia || ARRAY['agencias', 'usuarios', 'bitacora', '_prisma_migrations'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tabla, rol);
      END LOOP;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RETURN;
  END IF;

  GRANT EXECUTE ON FUNCTION public.poliza_de_mi_agencia(text) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.poliza_eliminada(text) TO authenticated;

  FOREACH tabla IN ARRAY tablas_agencia LOOP
    EXECUTE format('DROP POLICY IF EXISTS "misma agencia" ON %I', tabla);
    -- (select ...) hace que la función se evalúe una vez por consulta, no por fila.
    EXECUTE format(
      'CREATE POLICY "misma agencia" ON %I FOR ALL TO authenticated '
      'USING (agencia_id = (SELECT public.agencia_actual())) '
      'WITH CHECK (agencia_id = (SELECT public.agencia_actual()))',
      tabla
    );
  END LOOP;

  -- Agencia propia: solo lectura.
  DROP POLICY IF EXISTS "mi agencia: leer" ON "agencias";
  CREATE POLICY "mi agencia: leer" ON "agencias" FOR SELECT TO authenticated
    USING (id = (SELECT public.agencia_actual()));

  -- Usuarios: solo lectura. Crear, editar roles o desactivar cuentas pasa por la app (ADMIN);
  -- por la API nadie podría ascenderse a ADMIN ni cambiarse de agencia.
  DROP POLICY IF EXISTS "misma agencia: leer" ON "usuarios";
  CREATE POLICY "misma agencia: leer" ON "usuarios" FOR SELECT TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()));

  -- Bitácora: solo agregar y leer; nunca editar ni borrar registros.
  DROP POLICY IF EXISTS "misma agencia: leer" ON "bitacora";
  CREATE POLICY "misma agencia: leer" ON "bitacora" FOR SELECT TO authenticated
    USING (agencia_id = (SELECT public.agencia_actual()));
  DROP POLICY IF EXISTS "misma agencia: agregar" ON "bitacora";
  CREATE POLICY "misma agencia: agregar" ON "bitacora" FOR INSERT TO authenticated
    WITH CHECK (agencia_id = (SELECT public.agencia_actual()));
END $$;
