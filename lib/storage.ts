import "server-only";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cliente de Cloudflare R2 (API compatible con S3) y URLs firmadas. El bucket es PRIVADO:
// los archivos solo se leen o escriben con estas URLs de corta vigencia.
// Variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.

/** Vigencia de las URLs firmadas: solo sirven para la operación que se inicia ahora. */
export const VIGENCIA_SUBIDA_S = 5 * 60;
export const VIGENCIA_LECTURA_S = 60;

function configuracionR2() {
  const cuenta = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!cuenta || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Faltan R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY o R2_BUCKET_NAME en el entorno.");
  }
  return { cuenta, accessKeyId, secretAccessKey, bucket };
}

let cliente: { s3: S3Client; bucket: string } | null = null;

/** Cliente S3 configurado para R2 (se crea una sola vez por proceso). */
export function getR2(): { s3: S3Client; bucket: string } {
  if (!cliente) {
    const { cuenta, accessKeyId, secretAccessKey, bucket } = configuracionR2();
    cliente = {
      bucket,
      s3: new S3Client({
        region: "auto",
        endpoint: `https://${cuenta}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        // Ruta …/bucket/clave en lugar de subdominio: funciona aunque el bucket tenga puntos.
        forcePathStyle: true,
      }),
    };
  }
  return cliente;
}

/**
 * URL firmada para que el navegador suba un archivo con PUT directo al bucket. El tipo y el
 * tamaño van dentro de la firma: con esta URL no se puede subir otro tipo ni otro tamaño
 * (R2 no admite POST con content-length-range). El PUT debe enviar `content-type: contentType`.
 */
export async function generarUrlSubida(clave: string, contentType: string, bytes: number): Promise<string> {
  const { s3, bucket } = getR2();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: clave, ContentType: contentType, ContentLength: bytes }),
    { expiresIn: VIGENCIA_SUBIDA_S, signableHeaders: new Set(["content-type", "content-length"]) }
  );
}

/** URL firmada de lectura; con `descargarComo`, el navegador descarga el archivo con ese nombre. */
export async function generarUrlLectura(clave: string, opciones?: { descargarComo?: string }): Promise<string> {
  const { s3, bucket } = getR2();
  const nombre = opciones?.descargarComo;
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: clave,
      ...(nombre && { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}` }),
    }),
    { expiresIn: VIGENCIA_LECTURA_S }
  );
}
