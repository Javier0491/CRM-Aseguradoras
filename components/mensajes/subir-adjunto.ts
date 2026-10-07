"use client";

// Preparación y subida de un adjunto del chat desde el navegador.

/** Lado mayor con el que se guardan las fotos: de sobra para verlas, sin subir 12 MP del celular. */
const LADO_MAXIMO = 2560;
/** Una foto de este tamaño (o menor) y dentro del lado máximo se sube tal cual. */
const BYTES_SIN_REDUCIR = 3 * 1024 * 1024;

export type ImagenLista = { archivo: File; tipo: string; ancho: number | null; alto: number | null };

/**
 * Reduce una foto grande antes de subirla (máximo 2560 px por lado; JPG o PNG según el original) y
 * mide sus dimensiones para reservar su lugar en el chat. Los GIF (pueden ser animados) y lo que el
 * navegador no pueda leer se suben tal cual.
 */
export async function prepararImagen(archivo: File, tipo: string): Promise<ImagenLista> {
  const tal = { archivo, tipo, ancho: null, alto: null };
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(tipo)) return tal;
  let mapa: ImageBitmap;
  try {
    mapa = await createImageBitmap(archivo);
  } catch {
    return tal;
  }
  const { width, height } = mapa;
  const escala = Math.min(1, LADO_MAXIMO / Math.max(width, height));
  if (tipo === "image/gif" || (escala === 1 && archivo.size <= BYTES_SIN_REDUCIR)) {
    mapa.close();
    return { archivo, tipo, ancho: width, alto: height };
  }
  const ancho = Math.round(width * escala);
  const alto = Math.round(height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext("2d")?.drawImage(mapa, 0, 0, ancho, alto);
  mapa.close();
  // PNG conserva la transparencia (capturas de pantalla); lo demás va en JPG.
  const salida = tipo === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((listo) => lienzo.toBlob(listo, salida, 0.85));
  if (!blob || blob.size >= archivo.size) return { archivo, tipo, ancho: width, alto: height };
  const nombre = `${archivo.name.replace(/\.[^.]+$/, "")}.${salida === "image/png" ? "png" : "jpg"}`;
  return { archivo: new File([blob], nombre, { type: salida }), tipo: salida, ancho, alto };
}

/**
 * Sube el archivo con PUT a la URL firmada, avisando el avance (0 a 1). `fetch` no informa el
 * avance de una subida, así que se usa XMLHttpRequest. Devuelve si el almacenamiento la aceptó.
 */
export function subirConProgreso(
  url: string,
  headers: Record<string, string>,
  cuerpo: Blob,
  alAvanzar: (avance: number) => void
): Promise<boolean> {
  return new Promise((resolver) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [nombre, valor] of Object.entries(headers)) xhr.setRequestHeader(nombre, valor);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alAvanzar(e.loaded / e.total);
    };
    xhr.onload = () => resolver(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolver(false);
    xhr.onabort = () => resolver(false);
    xhr.send(cuerpo);
  });
}
