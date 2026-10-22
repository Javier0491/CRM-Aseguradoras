// Carga masiva: acceso a lo que eligió el usuario (una carpeta o el ZIP de una carpeta) y a los
// documentos de cada póliza, incluidos los que vienen dentro de un ZIP de la carpeta (p. ej. el
// de facturas del portal). Solo se lee lo que se va a usar: nada se sube ni se guarda completo.

import { ARCHIVOS, formatBytes } from "@/lib/archivos/config";
import { crearZip, esZip, extraerDeZip, leerIndiceZip, mimePorNombre } from "@/lib/archivos/zip";
import {
  carpetasPolizaDe,
  esBasuraDeSistema,
  estaDentroDe,
  ZIP_SOLO_COBRANZA,
  type DocumentoCandidato,
  type UnidadPoliza,
} from "@/lib/carga-masiva/agrupar";

export type ArchivoFuente = { ruta: string; tamano: number; leer: () => Promise<Blob> };

export type Fuente = {
  /** Nombre de la carpeta o del ZIP elegido. */
  nombre: string;
  archivos: Map<string, ArchivoFuente>;
  /** ZIP ya abiertos: su contenido está en `archivos` como "ruta/del.zip/ruta interna". */
  zips: Set<string>;
};

/** ZIP dentro de la carpeta que se abren para buscar documentos (los de un portal pesan pocos MB). */
const ZIP_INTERNO_MAX = 150 * 1024 * 1024;
/** Separa la ruta de un ZIP de la ruta dentro de él en la referencia de un documento. */
const DENTRO = "::";

export type DocumentoPoliza = DocumentoCandidato & {
  /** Cómo volver a encontrarlo: ruta en la fuente y, si está en un ZIP, "::ruta interna". */
  ref: string;
  leer: () => Promise<Blob>;
};

/** Carpeta elegida con el selector de carpetas (cada File trae su ruta relativa). */
export function fuenteDeCarpeta(archivos: FileList | File[]): Fuente {
  const lista = Array.from(archivos);
  const mapa = new Map<string, ArchivoFuente>();
  for (const f of lista) {
    const ruta = (f.webkitRelativePath || f.name).replace(/\\/g, "/");
    mapa.set(ruta, { ruta, tamano: f.size, leer: async () => f });
  }
  const nombre = lista[0]?.webkitRelativePath.split("/")[0] || "Carpeta";
  return { nombre, archivos: mapa, zips: new Set() };
}

/** ZIP de la carpeta completa: se lee por partes, sin cargarlo entero en memoria. */
export async function fuenteDeZip(zip: File): Promise<Fuente> {
  const entradas = await leerIndiceZip(zip);
  const mapa = new Map<string, ArchivoFuente>();
  for (const e of entradas) {
    mapa.set(e.ruta, { ruta: e.ruta, tamano: e.tamano, leer: async () => new Blob([await extraerDeZip(zip, e)]) });
  }
  return { nombre: zip.name.replace(/\.zip$/i, ""), archivos: mapa, zips: new Set() };
}

/** Hasta qué profundidad se abren ZIP dentro de ZIP para buscar pólizas. */
const PROFUNDIDAD_ZIP = 6;

/**
 * Abre los ZIP que no están dentro de una póliza (los de un portal, o uno que guarda las pólizas
 * de varios meses como "06 10 2023.zip") y agrega su contenido como si fueran carpetas, para que
 * la agrupación los separe. Los ZIP de una póliza (su factura, sus recibos) no se abren aquí: se
 * leen al procesarla. El contenido se vuelve a extraer cuando se usa; no se guarda en memoria.
 */
export async function expandirZips(
  fuente: Fuente,
  alAvanzar?: (abiertos: number) => void,
  profundidadMaxima = PROFUNDIDAD_ZIP
): Promise<Fuente> {
  const archivos = new Map(fuente.archivos);
  const zips = new Set<string>();
  const dePoliza = carpetasPolizaDe(archivos.keys());
  const pendientes = [...archivos.values()]
    .filter((a) => esZip({ name: a.ruta }) && !estaDentroDe(a.ruta, dePoliza))
    .map((a) => ({ archivo: a, profundidad: 1 }));

  while (pendientes.length > 0) {
    const { archivo: zip, profundidad } = pendientes.shift()!;
    const nombre = zip.ruta.split("/").at(-1) ?? "";
    if (ZIP_SOLO_COBRANZA.test(nombre) || zip.tamano > ZIP_INTERNO_MAX * 20) continue;
    let entradas;
    try {
      entradas = await leerIndiceZip(await zip.leer());
    } catch {
      continue; // ZIP dañado: queda como un archivo más
    }
    zips.add(zip.ruta);
    alAvanzar?.(zips.size);
    // Dentro de este ZIP, los ZIP que sean parte de una póliza (o del ZIP mismo si ya es una
    // póliza, con su Carátula) no se abren.
    const internasDePoliza = carpetasPolizaDe(entradas.map((e) => `${nombre}/${e.ruta}`));
    for (const e of entradas) {
      if (esBasuraDeSistema(e.ruta)) continue;
      const ruta = `${zip.ruta}/${e.ruta}`;
      const interno: ArchivoFuente = {
        ruta,
        tamano: e.tamano,
        leer: async () => new Blob([await extraerDeZip(await zip.leer(), e)]),
      };
      archivos.set(ruta, interno);
      const dentroDePoliza = estaDentroDe(`${nombre}/${e.ruta}`, internasDePoliza) || internasDePoliza.has(nombre);
      if (esZip({ name: e.nombre }) && profundidad < profundidadMaxima && !dentroDePoliza && e.tamano <= ZIP_INTERNO_MAX) {
        pendientes.push({ archivo: interno, profundidad: profundidad + 1 });
      }
    }
  }
  return { ...fuente, archivos, zips };
}

const esDocumento = (nombre: string) => mimePorNombre(nombre) !== "";

/** Documentos dentro de un ZIP (y de los ZIP que traiga adentro, un nivel más). */
async function documentosDeZip(
  zip: Blob,
  rutaVisible: string,
  ref: string,
  profundidad: number
): Promise<DocumentoPoliza[]> {
  const docs: DocumentoPoliza[] = [];
  let entradas;
  try {
    entradas = await leerIndiceZip(zip);
  } catch {
    return docs; // ZIP dañado o no soportado: se ignora, como un archivo más que no se lee
  }
  for (const e of entradas) {
    const ruta = `${rutaVisible}/${e.ruta}`;
    if (esDocumento(e.nombre)) {
      docs.push({ ruta, tamano: e.tamano, ref: `${ref}${DENTRO}${e.ruta}`, leer: async () => new Blob([await extraerDeZip(zip, e)]) });
    } else if (profundidad > 0 && esZip({ name: e.nombre }) && e.tamano <= ZIP_INTERNO_MAX) {
      const interno = new Blob([await extraerDeZip(zip, e)]);
      docs.push(...(await documentosDeZip(interno, ruta, `${ref}${DENTRO}${e.ruta}`, profundidad - 1)));
    }
  }
  return docs;
}

/** Todos los documentos (PDF e imágenes) de una póliza, con su ruta relativa a ella. */
export async function documentosDe(unidad: UnidadPoliza, fuente: Fuente): Promise<DocumentoPoliza[]> {
  const docs: DocumentoPoliza[] = [];
  for (const ruta of unidad.archivos) {
    const archivo = fuente.archivos.get(ruta);
    if (!archivo) continue;
    // Dentro de una carpeta (o ZIP abierto) de póliza se muestra la ruta desde ella; un archivo
    // suelto, su nombre.
    const visible = ruta.startsWith(`${unidad.clave}/`) ? ruta.slice(unidad.clave.length + 1) : (ruta.split("/").at(-1) ?? ruta);
    if (esDocumento(ruta)) {
      docs.push({ ruta: visible, tamano: archivo.tamano, ref: ruta, leer: archivo.leer });
    } else if (esZip({ name: ruta }) && archivo.tamano <= ZIP_INTERNO_MAX) {
      docs.push(...(await documentosDeZip(await archivo.leer(), visible, ruta, 1)));
    }
  }
  return docs;
}

/** Vuelve a leer un documento por su referencia (p. ej. al revisar una póliza más tarde). */
export async function leerDocumento(ref: string, fuente: Fuente): Promise<Blob | null> {
  const [ruta, ...internas] = ref.split(DENTRO);
  const archivo = fuente.archivos.get(ruta);
  if (!archivo) return null;
  let actual = await archivo.leer();
  for (const interna of internas) {
    const entrada = (await leerIndiceZip(actual)).find((e) => e.ruta === interna);
    if (!entrada) return null;
    actual = new Blob([await extraerDeZip(actual, entrada)]);
  }
  return actual;
}

/** File listo para leer con IA o subir: copia en memoria con el tipo según su extensión. */
export const comoArchivo = async (blob: Blob, ruta: string) =>
  new File([await blob.arrayBuffer()], ruta.split("/").at(-1) ?? ruta, { type: mimePorNombre(ruta) });


/**
 * Expediente de respaldo de la póliza: su ZIP tal cual o, si es una carpeta, un ZIP con todo lo
 * que tiene (carátula, condiciones, certificados, facturas…). Un PDF suelto no lleva expediente: ya
 * se guarda como carátula. Si pasa del límite del expediente, se dice por qué no se subió.
 */
export async function expedienteDe(
  unidad: UnidadPoliza,
  fuente: Fuente
): Promise<{ archivo: File; ilegibles: string[] } | { omitido: string } | null> {
  const maximo = ARCHIVOS.expediente.maxBytes;
  const demasiado = (bytes: number) => ({
    omitido: `El expediente pesa ${formatBytes(bytes)} y el máximo es ${formatBytes(maximo)}: súbelo a mano desde la póliza.`,
  });
  const archivos = unidad.archivos
    .filter((ruta) => !esBasuraDeSistema(ruta))
    .flatMap((ruta) => fuente.archivos.get(ruta) ?? []);
  if (archivos.length === 0) return null;

  if (unidad.tipo === "zip") {
    // El ZIP original tal cual (aunque esté dentro de otro ZIP).
    const zip = fuente.archivos.get(unidad.clave);
    if (!zip) return null;
    if (zip.tamano > maximo) return demasiado(zip.tamano);
    return {
      archivo: new File([await zip.leer()], zip.ruta.split("/").at(-1) ?? "expediente.zip", { type: "application/zip" }),
      ilegibles: [],
    };
  }
  if (unidad.tipo === "pdf" && archivos.length === 1) return null;

  const total = archivos.reduce((s, a) => s + a.tamano, 0);
  if (total > maximo) return demasiado(total);
  // Dentro del ZIP las rutas empiezan en la carpeta de la póliza (o en el nombre del PDF suelto).
  const corte = unidad.tipo === "carpeta" ? unidad.clave.lastIndexOf("/") + 1 : null;
  // Un archivo que Windows no deja leer (p. ej. con una ruta de más de 260 caracteres) se deja
  // fuera del expediente en lugar de perderlo todo.
  const ilegibles: string[] = [];
  const leidos = await Promise.all(
    archivos.map(async (a) => {
      try {
        return {
          ruta: corte === null ? (a.ruta.split("/").at(-1) ?? a.ruta) : a.ruta.slice(corte),
          contenido: new Blob([await (await a.leer()).arrayBuffer()]),
        };
      } catch {
        ilegibles.push(a.ruta.split("/").at(-1) ?? a.ruta);
        return null;
      }
    })
  );
  const zip = await crearZip(leidos.filter((l) => l !== null));
  if (zip.size > maximo) return demasiado(zip.size);
  const nombre = unidad.nombre.replace(/[\\/:*?"<>|]+/g, " ").trim() || "expediente";
  return { archivo: new File([zip], `${nombre}.zip`, { type: "application/zip" }), ilegibles };
}
