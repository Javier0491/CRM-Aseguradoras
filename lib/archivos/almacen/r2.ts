import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  S3ServiceException,
} from "@aws-sdk/client-s3";

import type { Almacen } from "@/lib/archivos/almacen/tipos";
import { generarUrlLectura, generarUrlSubida, getR2 } from "@/lib/storage";

/** Cloudflare R2 con bucket privado; el cliente y las URLs firmadas viven en lib/storage.ts. */
export function crearAlmacenR2(): Almacen {
  const { s3, bucket } = getR2(); // falla aquí, con un mensaje claro, si faltan variables

  const noExiste = (e: unknown) =>
    e instanceof NotFound || (e instanceof S3ServiceException && e.$metadata.httpStatusCode === 404);

  return {
    proveedor: "r2",

    async urlSubida(clave, contentType, bytes) {
      return { url: await generarUrlSubida(clave, contentType, bytes), headers: { "content-type": contentType } };
    },

    async info(clave) {
      try {
        const r = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: clave }));
        return { bytes: r.ContentLength ?? 0 };
      } catch (e) {
        if (noExiste(e)) return null;
        throw e;
      }
    },

    async leerInicio(clave, n) {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: clave, Range: `bytes=0-${n - 1}` }));
        return r.Body ? await r.Body.transformToByteArray() : null;
      } catch (e) {
        if (noExiste(e)) return null;
        throw e;
      }
    },

    async eliminar(claves) {
      // DeleteObjects acepta hasta 1000 claves por solicitud.
      for (let i = 0; i < claves.length; i += 1000) {
        const lote = claves.slice(i, i + 1000);
        await s3.send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true } })
        );
      }
    },

    async listarCarpeta(prefijo) {
      const claves: string[] = [];
      let token: string | undefined;
      do {
        const lista = await s3.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefijo, ContinuationToken: token })
        );
        claves.push(...(lista.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k)));
        token = lista.IsTruncated ? lista.NextContinuationToken : undefined;
      } while (token);
      return claves;
    },

    urlDescarga: generarUrlLectura,
  };
}
