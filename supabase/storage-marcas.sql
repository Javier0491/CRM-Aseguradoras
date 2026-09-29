-- Bucket PÚBLICO con los logos de las agencias (white-label): {agenciaId}/logo-{uuid}.{ext}.
-- Ejecutar en Supabase → SQL Editor. Es idempotente.
--
-- Público porque el logo se muestra con un <img> normal en el sidebar (a diferencia de los
-- expedientes, que son privados). Sin políticas de escritura: solo la app sube y borra, con la
-- secret key y después de verificar que quien lo pide es ADMIN de esa agencia
-- (lib/agencias/actions.ts). Nadie puede escribir aquí con la llave pública ni con su sesión.
-- SVG no se admite: podría llevar scripts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marcas', 'marcas', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
