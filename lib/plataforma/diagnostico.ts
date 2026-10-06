import "server-only";

import { HeadBucketCommand } from "@aws-sdk/client-s3";

import { db } from "@/lib/db";
import { getEjecuciones, HORAS_SIN_CORRER } from "@/lib/plataforma/cron";
import { getEstadoMigraciones } from "@/lib/plataforma/migraciones";
import { getR2 } from "@/lib/storage";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type EstadoRevision = "ok" | "aviso" | "error";

export type Revision = {
  clave: string;
  titulo: string;
  estado: EstadoRevision;
  detalle: string;
  /** Qué hacer para corregirlo. */
  ayuda?: string;
  /** Texto para copiar (p. ej. la política CORS). */
  bloque?: string;
};

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function revisarBaseDeDatos(): Promise<Revision[]> {
  const inicio = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (e) {
    return [{ clave: "db", titulo: "Base de datos", estado: "error", detalle: `No responde: ${mensaje(e)}`, ayuda: "Revisa DATABASE_URL." }];
  }
  const latencia = Date.now() - inicio;
  const revisiones: Revision[] = [
    {
      clave: "db",
      titulo: "Base de datos",
      estado: latencia > 1500 ? "aviso" : "ok",
      detalle: `Responde en ${latencia} ms.`,
    },
  ];
  try {
    const m = await getEstadoMigraciones();
    if (m.fallidas.length > 0) {
      revisiones.push({
        clave: "migraciones",
        titulo: "Migraciones",
        estado: "error",
        detalle: `Falló ${m.fallidas.map((f) => f.nombre).join(", ")}.`,
        ayuda: "Corrige la causa y marca la migración con «npx prisma migrate resolve» antes de volver a aplicarla.",
        bloque: m.fallidas.map((f) => `${f.nombre}\n${f.error ?? ""}`).join("\n\n"),
      });
    } else if (m.pendientes === null) {
      revisiones.push({
        clave: "migraciones",
        titulo: "Migraciones",
        estado: "aviso",
        detalle: `${m.aplicadas} aplicadas. No se pudo leer prisma/migrations para compararlas con el código.`,
      });
    } else if (m.pendientes.length > 0) {
      revisiones.push({
        clave: "migraciones",
        titulo: "Migraciones",
        estado: "error",
        detalle: `Faltan ${m.pendientes.length}: ${m.pendientes.join(", ")}.`,
        ayuda: "Aplica las pendientes con «npx prisma migrate deploy» (con DIRECT_URL de producción).",
      });
    } else {
      revisiones.push({ clave: "migraciones", titulo: "Migraciones", estado: "ok", detalle: `Las ${m.aplicadas} migraciones están aplicadas.` });
    }
  } catch (e) {
    revisiones.push({ clave: "migraciones", titulo: "Migraciones", estado: "aviso", detalle: `No se pudo revisar: ${mensaje(e)}` });
  }
  return revisiones;
}

async function revisarTareaDiaria(): Promise<Revision> {
  if (!process.env.CRON_SECRET) {
    return {
      clave: "cron",
      titulo: "Tarea diaria (avisos y cobranza)",
      estado: "error",
      detalle: "Falta CRON_SECRET.",
      ayuda: "Agrega CRON_SECRET (un valor largo y aleatorio) a las variables de entorno.",
    };
  }
  const [ultima] = await getEjecuciones("diaria", 1);
  if (!ultima) {
    return {
      clave: "cron",
      titulo: "Tarea diaria (avisos y cobranza)",
      estado: "aviso",
      detalle: "Nunca se ha ejecutado.",
      ayuda:
        "Programa una llamada diaria a GET /api/cron/avisos con «Authorization: Bearer <CRON_SECRET>» (en Vercel: un Cron Job en vercel.json).",
    };
  }
  const horas = (Date.now() - ultima.inicio.getTime()) / 3_600_000;
  if (ultima.ok === false) {
    return {
      clave: "cron",
      titulo: "Tarea diaria (avisos y cobranza)",
      estado: "error",
      detalle: `La última ejecución (${fechaHora.format(ultima.inicio)}) falló.`,
      bloque: ultima.error ?? undefined,
    };
  }
  if (horas > HORAS_SIN_CORRER) {
    return {
      clave: "cron",
      titulo: "Tarea diaria (avisos y cobranza)",
      estado: "error",
      detalle: `No corre desde el ${fechaHora.format(ultima.inicio)}.`,
      ayuda: "Revisa la tarea programada que llama a /api/cron/avisos.",
    };
  }
  return {
    clave: "cron",
    titulo: "Tarea diaria (avisos y cobranza)",
    estado: "ok",
    detalle: `Última ejecución correcta: ${fechaHora.format(ultima.inicio)}.`,
    bloque: ultima.resumen ? JSON.stringify(ultima.resumen, null, 2) : undefined,
  };
}

/** Política CORS que necesita R2 para que el navegador suba archivos desde `origen`. */
const politicaCors = (origenes: string[]) =>
  JSON.stringify(
    [{ AllowedOrigins: origenes, AllowedMethods: ["PUT"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 3600 }],
    null,
    2
  );

async function revisarAlmacenamiento(origen: string): Promise<Revision[]> {
  const proveedor = process.env.ALMACEN_ARCHIVOS?.trim().toLowerCase() || "supabase";
  if (proveedor !== "r2") {
    return [
      {
        clave: "almacen",
        titulo: "Almacenamiento de archivos",
        estado: getSupabaseConfig() ? "ok" : "error",
        detalle: getSupabaseConfig()
          ? "Supabase Storage (bucket «expedientes»)."
          : "Supabase Storage sin configurar (faltan NEXT_PUBLIC_SUPABASE_URL o la llave pública).",
      },
    ];
  }
  let r2: ReturnType<typeof getR2>;
  try {
    r2 = getR2();
  } catch (e) {
    return [{ clave: "almacen", titulo: "Almacenamiento (Cloudflare R2)", estado: "error", detalle: mensaje(e) }];
  }
  const revisiones: Revision[] = [];
  try {
    await r2.s3.send(new HeadBucketCommand({ Bucket: r2.bucket }));
    revisiones.push({ clave: "almacen", titulo: "Almacenamiento (Cloudflare R2)", estado: "ok", detalle: `Bucket «${r2.bucket}» accesible.` });
  } catch (e) {
    // Un token limitado a objetos puede no tener permiso de HeadBucket: no es grave.
    const codigo = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    revisiones.push({
      clave: "almacen",
      titulo: "Almacenamiento (Cloudflare R2)",
      estado: codigo === 403 ? "ok" : "error",
      detalle:
        codigo === 403
          ? `Bucket «${r2.bucket}» configurado (el token solo opera archivos, como debe ser).`
          : `No se pudo contactar el bucket «${r2.bucket}»: ${mensaje(e)}`,
    });
  }

  // Lo mismo que hace el navegador antes de subir: preguntar a R2 si acepta PUT desde este dominio.
  const cuenta = process.env.R2_ACCOUNT_ID?.trim();
  try {
    const r = await fetch(`https://${cuenta}.r2.cloudflarestorage.com/${r2.bucket}/diagnostico.pdf`, {
      method: "OPTIONS",
      headers: { Origin: origen, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" },
      cache: "no-store",
    });
    const permitido = r.ok && r.headers.get("access-control-allow-origin") !== null;
    revisiones.push(
      permitido
        ? { clave: "cors", titulo: "Subidas desde el navegador (CORS)", estado: "ok", detalle: `R2 acepta subidas desde ${origen}.` }
        : {
            clave: "cors",
            titulo: "Subidas desde el navegador (CORS)",
            estado: "error",
            detalle: `R2 rechaza las subidas desde ${origen}: los usuarios verán «El almacenamiento rechazó la subida».`,
            ayuda: `Cloudflare → R2 → ${r2.bucket} → Settings → CORS Policy: agrega este dominio (y los demás desde los que se entra al CRM).`,
            bloque: politicaCors(["http://localhost:3000", origen]),
          }
    );
  } catch (e) {
    revisiones.push({ clave: "cors", titulo: "Subidas desde el navegador (CORS)", estado: "aviso", detalle: `No se pudo verificar: ${mensaje(e)}` });
  }
  return revisiones;
}

function revisarCorreo(): Revision {
  const llave = process.env.RESEND_API_KEY?.trim();
  const remitente = process.env.EMAIL_SENDER?.trim();
  if (!llave || !remitente) {
    return {
      clave: "correo",
      titulo: "Correo (Resend)",
      estado: "error",
      detalle: `Falta ${!llave ? "RESEND_API_KEY" : "EMAIL_SENDER"}: no salen comunicados, avisos ni la cobranza.`,
    };
  }
  return {
    clave: "correo",
    titulo: "Correo (Resend)",
    estado: "ok",
    detalle: `Configurado; remitente ${remitente}. Usa «Enviar correo de prueba» para confirmarlo.`,
  };
}

async function revisarIa(): Promise<Revision> {
  const llave = process.env.OPENAI_API_KEY?.trim();
  const modelo = process.env.OPENAI_MODEL?.trim() || "gpt-4o";
  if (!llave) {
    return { clave: "ia", titulo: "Captura Inteligente (OpenAI)", estado: "error", detalle: "Falta OPENAI_API_KEY: la captura con IA no funciona." };
  }
  try {
    const r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(modelo)}`, {
      headers: { Authorization: `Bearer ${llave}` },
      cache: "no-store",
    });
    if (r.ok) return { clave: "ia", titulo: "Captura Inteligente (OpenAI)", estado: "ok", detalle: `Llave válida; modelo ${modelo} disponible.` };
    return {
      clave: "ia",
      titulo: "Captura Inteligente (OpenAI)",
      estado: "error",
      detalle: r.status === 401 ? "La llave de OpenAI no es válida." : `OpenAI respondió ${r.status} para el modelo ${modelo}.`,
    };
  } catch (e) {
    return { clave: "ia", titulo: "Captura Inteligente (OpenAI)", estado: "aviso", detalle: `No se pudo verificar: ${mensaje(e)}` };
  }
}

function revisarSupabase(): Revision {
  const publica = getSupabaseConfig();
  const secreta = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!publica) {
    return { clave: "auth", titulo: "Inicio de sesión (Supabase Auth)", estado: "error", detalle: "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY." };
  }
  return secreta
    ? { clave: "auth", titulo: "Inicio de sesión (Supabase Auth)", estado: "ok", detalle: "Configurado, con la llave secreta para crear cuentas y cambiar de agencia." }
    : {
        clave: "auth",
        titulo: "Inicio de sesión (Supabase Auth)",
        estado: "aviso",
        detalle: "Falta SUPABASE_SECRET_KEY: no se pueden crear cuentas ni cambiar de agencia.",
      };
}

async function revisarAvisos(): Promise<Revision> {
  const sinBuzon = await db.agencia.findMany({
    where: {
      suspendida: false,
      correoCopiaAvisos: null,
      aseguradoras: {
        some: {
          OR: [
            { avisoDiasAntes: { not: null } },
            { avisoDiasVencido: { not: null } },
            { avisoDiasRenovacion: { not: null } },
          ],
        },
      },
    },
    select: { nombre: true },
  });
  return sinBuzon.length === 0
    ? { clave: "avisos", titulo: "Avisos automáticos", estado: "ok", detalle: "Las agencias con avisos configurados tienen buzón de copia." }
    : {
        clave: "avisos",
        titulo: "Avisos automáticos",
        estado: "aviso",
        detalle: `Configuraron avisos pero no su buzón de copia, así que no salen: ${sinBuzon.map((a) => a.nombre).join(", ")}.`,
        ayuda: "Cada agencia lo captura en Configuración → Avisos automáticos.",
      };
}

/** Revisión completa de la plataforma; `origen` es el dominio desde el que se usa el CRM. */
export async function ejecutarDiagnostico(origen: string) {
  const [db_, cron, almacen, ia, avisos] = await Promise.all([
    revisarBaseDeDatos(),
    revisarTareaDiaria().catch((e): Revision => ({ clave: "cron", titulo: "Tarea diaria", estado: "aviso", detalle: mensaje(e) })),
    revisarAlmacenamiento(origen),
    revisarIa(),
    revisarAvisos().catch((e): Revision => ({ clave: "avisos", titulo: "Avisos automáticos", estado: "aviso", detalle: mensaje(e) })),
  ]);
  return [...db_, cron, revisarSupabase(), ...almacen, revisarCorreo(), ia, avisos];
}
