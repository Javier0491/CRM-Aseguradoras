// Carga masiva: cómo se parte una carpeta (o el ZIP de una carpeta) con la cartera en pólizas, y
// qué documentos de cada una se mandan a leer con IA. Funciones puras: las usa el navegador y
// las pruebas.
//
// Una póliza es:
// - una carpeta con nombre de vigencia ("24-25 619607 HECTOR …") o con una subcarpeta
//   Carátula / Póliza (lo que descargan los portales), con todo lo que tenga adentro;
// - un ZIP suelto (p. ej. "0000619607.zip" o "Documentos88554-04134….zip" de un portal);
// - PDFs sueltos de una misma carpeta que comparten número ("Poliza 0413…pdf" y
//   "Recibos Poliza 0413…pdf"), o un PDF suelto sin compañeros.
//
// Los ZIP sueltos se abren antes de agrupar (ver expandirZips) y su contenido se trata como una
// carpeta más: un ZIP con varias pólizas adentro ("06 10 2023.zip" → AGOSTO 2023/…zip, …) es solo
// un contenedor y se separa en ellas; uno sin pólizas adentro es una póliza.

import { OCR_MAX_BYTES, OCR_MAX_BYTES_TOTAL } from "@/lib/ocr/types";

export type ArchivoRuta = { ruta: string; tamano: number };

export type UnidadPoliza = {
  /** Identifica la póliza entre cargas: su ruta dentro de lo elegido. */
  clave: string;
  nombre: string;
  tipo: "carpeta" | "zip" | "pdf";
  /** Rutas completas de sus archivos. */
  archivos: string[];
  /** Número tomado del nombre (solo dígitos, sin ceros a la izquierda) para comparar con la lectura. */
  numero: string | null;
  /** Otras ubicaciones con el mismo nombre: son copias y no se procesan. */
  copias: string[];
};

export type Omitido = { ruta: string; motivo: string };

/** Una ubicación que no se lee porque es la misma póliza que otra (la que sí se lee). */
export type Repetida = { unidad: UnidadPoliza; original: string; motivo: string };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const extension = (ruta: string) => ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase();
const DOCUMENTO = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);

const VIGENCIA = /^\d{2}\s*-\s*\d{2}\s+\S/;
/** Subcarpetas que marcan a su carpeta madre como una póliza descargada del portal. */
const SUBCARPETA_POLIZA = /^(caratula|poliza)s?$/i;
/** Carpetas con documentos de apoyo: sueltas no son una póliza. */
const CARPETA_APOYO = /^(certificados|credenciales|condiciones generales|textos.*|acuse.*|ac|endosos?|listados?|detalle de coberturas|carta bienvenida|aviso pago|pagos?|facturas?|recibos)$/i;
/** ZIP sueltos que solo traen facturas o pagos. */
export const ZIP_SOLO_COBRANZA = /^(fact|pago|aviso)_/i;

const segmentosDe = (ruta: string) => ruta.split("/").filter(Boolean);

/**
 * Carpetas que son una póliza por sí mismas: por su nombre de vigencia o por tener una subcarpeta
 * Carátula / Póliza. (Sirve también para rutas dentro de un ZIP.)
 */
export function carpetasPolizaDe(rutas: Iterable<string>): Set<string> {
  const carpetas = new Set<string>();
  for (const ruta of rutas) {
    const segmentos = segmentosDe(ruta);
    for (let i = 0; i < segmentos.length - 1; i++) {
      if (VIGENCIA.test(segmentos[i])) carpetas.add(segmentos.slice(0, i + 1).join("/"));
      if (i > 0 && SUBCARPETA_POLIZA.test(sinAcentos(segmentos[i]))) carpetas.add(segmentos.slice(0, i).join("/"));
    }
  }
  return carpetas;
}

/** ¿La ruta está dentro de alguna de las carpetas? */
export const estaDentroDe = (ruta: string, carpetas: ReadonlySet<string>) => {
  const segmentos = segmentosDe(ruta);
  return segmentos.some((_, i) => i > 0 && carpetas.has(segmentos.slice(0, i).join("/")));
};

const nombreSinZip = (nombre: string) => nombre.replace(/\.zip$/i, "");

/** Copias que dejan macOS y Windows al comprimir ("__MACOSX/", "._archivo", desktop.ini…). */
export const esBasuraDeSistema = (ruta: string) =>
  /(^|\/)__MACOSX\//i.test(ruta) || /(^|\/)(\._[^/]*|desktop\.ini|\.ds_store|thumbs\.db)$/i.test(ruta);

/** Corrida de dígitos más larga del texto (≥ 5), sin ceros a la izquierda. */
export function numeroDeNombre(nombre: string): string | null {
  const corridas = sinAcentos(nombre).replace(VIGENCIA, (m) => m.slice(-1)).match(/\d+/g) ?? [];
  const larga = corridas.reduce((a, b) => (b.length > a.length ? b : a), "");
  const limpio = larga.replace(/^0+/, "");
  return larga.length >= 5 && limpio.length >= 4 ? limpio : null;
}

/**
 * ¿El número leído por la IA corresponde al del nombre de la carpeta o archivo? Se comparan solo
 * los dígitos: uno debe contener al otro ("0000619607" ↔ "619607",
 * "Documentos88554-041340497896000000" ↔ "1340497896").
 */
export function coincideNumero(numeroNombre: string, leidos: string[]): boolean {
  return leidos.some((l) => {
    const d = l.replace(/\D/g, "").replace(/^0+/, "");
    return d.length >= 4 && (d.includes(numeroNombre) || numeroNombre.includes(d));
  });
}

/**
 * Parte la lista de archivos en pólizas. `zips` son los ZIP ya abiertos: su contenido viene en la
 * lista como si el ZIP fuera una carpeta ("…/06 10 2023.zip/AGOSTO 2023/…").
 */
export function agruparPolizas(
  archivos: ArchivoRuta[],
  zips: ReadonlySet<string> = new Set(),
  /** Copias que el usuario pidió leer aparte: no se juntan con su original. */
  separadas: ReadonlySet<string> = new Set()
): { unidades: UnidadPoliza[]; omitidos: Omitido[]; repetidas: Repetida[] } {
  // Un ZIP abierto ya no cuenta como archivo: cuenta su contenido.
  const partes = archivos
    .filter((a) => !zips.has(a.ruta) && !esBasuraDeSistema(a.ruta))
    .map((a) => ({ ...a, segmentos: segmentosDe(a.ruta) }));
  const carpetasPoliza = carpetasPolizaDe(partes.map((p) => p.ruta));

  // Un ZIP abierto es una póliza salvo que adentro haya varias (carpetas de póliza o ZIP con número
  // que no estén entre los documentos de apoyo): entonces es solo un contenedor. Si adentro hay una
  // sola (p. ej. el ZIP del portal con su carpeta "0000023696/Caratula/…"), el ZIP es esa póliza.
  const esPolizaAdentro = (ruta: string, zip: string) => {
    const relativa = segmentosDe(ruta.slice(zip.length + 1));
    const nombre = relativa.at(-1) ?? "";
    if (relativa.slice(0, -1).some((s) => CARPETA_APOYO.test(sinAcentos(s)))) return false;
    return carpetasPoliza.has(ruta) || (zips.has(ruta) && !ZIP_SOLO_COBRANZA.test(nombre) && numeroDeNombre(nombre) !== null);
  };
  const candidatos = [...carpetasPoliza, ...zips];
  for (const zip of zips) {
    if (carpetasPoliza.has(zip) || ZIP_SOLO_COBRANZA.test(segmentosDe(zip).at(-1) ?? "")) continue;
    const adentro = candidatos.filter((c) => c.startsWith(`${zip}/`) && esPolizaAdentro(c, zip));
    // Solo cuentan las de más afuera: lo que esté dentro de otra póliza es parte de ella.
    const polizas = adentro.filter((c) => !adentro.some((o) => c.startsWith(`${o}/`)));
    if (polizas.length < 2) carpetasPoliza.add(zip);
  }

  const porCarpeta = new Map<string, string[]>();
  const sueltosPorCarpeta = new Map<string, ArchivoRuta[]>();
  const unidades: UnidadPoliza[] = [];
  const omitidos: Omitido[] = [];

  for (const a of partes) {
    // La póliza es la carpeta más externa que lo sea (sus subcarpetas son parte de ella).
    let carpeta: string | null = null;
    for (let i = 1; i < a.segmentos.length && !carpeta; i++) {
      const ruta = a.segmentos.slice(0, i).join("/");
      if (carpetasPoliza.has(ruta)) carpeta = ruta;
    }
    if (carpeta) {
      porCarpeta.set(carpeta, [...(porCarpeta.get(carpeta) ?? []), a.ruta]);
      continue;
    }

    const nombre = a.segmentos.at(-1) ?? a.ruta;
    const madre = a.segmentos.slice(0, -1).join("/");
    const ext = extension(nombre);
    if (ext === "zip") {
      // Un ZIP que no se pudo abrir: se intenta como una póliza al procesarlo.
      if (ZIP_SOLO_COBRANZA.test(nombre)) omitidos.push({ ruta: a.ruta, motivo: "Solo trae facturas o pagos" });
      else
        unidades.push({
          clave: a.ruta,
          nombre: nombreSinZip(nombre),
          tipo: "zip",
          archivos: [a.ruta],
          numero: numeroDeNombre(nombre),
          copias: [],
        });
    } else if (DOCUMENTO.has(ext)) {
      if (a.segmentos.slice(0, -1).some((s) => CARPETA_APOYO.test(sinAcentos(s)))) {
        omitidos.push({ ruta: a.ruta, motivo: "Documento de apoyo fuera de una póliza" });
      } else {
        sueltosPorCarpeta.set(madre, [...(sueltosPorCarpeta.get(madre) ?? []), a]);
      }
    } else if (ext !== "xml") {
      omitidos.push({ ruta: a.ruta, motivo: "No es PDF, imagen ni ZIP" });
    }
  }

  for (const [carpeta, rutas] of porCarpeta) {
    const nombre = nombreSinZip(carpeta.split("/").at(-1) ?? carpeta);
    const tipo = zips.has(carpeta) ? "zip" : "carpeta";
    unidades.push({ clave: carpeta, nombre, tipo, archivos: rutas, numero: numeroDeNombre(nombre), copias: [] });
  }

  // PDFs sueltos: los de una misma carpeta con el mismo número son una sola póliza. Si en la
  // carpeta hay una sola póliza o carátula entre otros documentos sin número común (p. ej.
  // "GUPO INDEBIT RC": la póliza de HDI y sus facturas), todos son de esa póliza.
  for (const [madre, sueltos] of sueltosPorCarpeta) {
    const grupos = new Map<string, ArchivoRuta[]>();
    const conPoliza = sueltos.filter((s) => /poliza|caratula/i.test(sinAcentos(s.ruta.split("/").at(-1) ?? "")));
    for (const s of sueltos) {
      const clave =
        conPoliza.length === 1 && sueltos.length > 1
          ? (numeroDeNombre(madre.split("/").at(-1) ?? "") ?? `carpeta:${madre}`)
          : (numeroDeNombre(s.ruta.split("/").at(-1) ?? "") ?? `archivo:${s.ruta}`);
      grupos.set(clave, [...(grupos.get(clave) ?? []), s]);
    }
    for (const [numero, grupo] of grupos) {
      const solo = grupo.length === 1;
      const nombreArchivo = grupo[0].ruta.split("/").at(-1) ?? grupo[0].ruta;
      unidades.push({
        clave: solo ? grupo[0].ruta : `${madre}/#${numero.startsWith("carpeta:") ? "carpeta" : numero}`,
        nombre: solo
          ? nombreArchivo.replace(/\.[^.]+$/, "")
          : numero.startsWith("carpeta:")
            ? (madre.split("/").at(-1) ?? madre)
            : `${madre.split("/").at(-1) ?? ""} · ${numero}`.trim(),
        tipo: "pdf",
        archivos: grupo.map((g) => g.ruta),
        numero: /^(archivo|carpeta):/.test(numero) ? null : numero,
        copias: [],
      });
    }
  }

  // La misma póliza guardada en varias carpetas (p. ej. "enviado" y "CRM 27 03 2024"): se procesa
  // la copia con más archivos. Dos carpetas de la misma vigencia y número son la misma póliza
  // aunque el número venga con ceros ("23-24 679535 …" y "23-24 0000679535 …"). Sin vigencia en el
  // nombre, solo es copia si además tiene los mismos archivos: "0000420721.zip" de 2023 y el de la
  // renovación de 2026 se llaman igual pero son vigencias distintas.
  const tamanos = new Map(partes.map((p) => [p.ruta, p.tamano]));
  const huella = (u: UnidadPoliza) => {
    const base = u.tipo === "pdf" ? u.clave.slice(0, u.clave.lastIndexOf("/") + 1) : `${u.clave}/`;
    return u.archivos
      .map((ruta) => `${ruta.startsWith(base) ? ruta.slice(base.length) : ""}:${tamanos.get(ruta) ?? 0}`)
      .sort()
      .join("|");
  };
  const porNombre = new Map<string, UnidadPoliza>();
  const repetidas: Repetida[] = [];
  for (const u of unidades.sort((a, b) => b.archivos.length - a.archivos.length || a.clave.localeCompare(b.clave))) {
    const vigencia = u.tipo !== "pdf" ? /^(\d{2})\s*-\s*(\d{2})/.exec(u.nombre) : null;
    const clave = separadas.has(u.clave)
      ? `separada|${u.clave}`
      : vigencia && u.numero
        ? `vigencia|${vigencia[1]}-${vigencia[2]}|${u.numero}`
        : `${u.tipo}|${sinAcentos(u.nombre).toUpperCase().replace(/\s+/g, " ").trim()}|${huella(u)}`;
    const original = porNombre.get(clave);
    if (original) {
      original.copias.push(u.clave);
      repetidas.push({
        unidad: u,
        original: original.clave,
        motivo:
          vigencia && u.numero
            ? `Misma vigencia ${vigencia[1]}-${vigencia[2]} y número ${u.numero}`
            : u.tipo === "pdf"
              ? "Mismo archivo (nombre y tamaño)"
              : u.tipo === "zip"
                ? "Mismo ZIP con los mismos archivos"
                : "Misma carpeta con los mismos archivos",
      });
    } else porNombre.set(clave, u);
  }
  return {
    unidades: [...porNombre.values()].sort((a, b) => a.clave.localeCompare(b.clave, "es")),
    omitidos,
    repetidas: repetidas.sort((a, b) => a.unidad.clave.localeCompare(b.unidad.clave, "es")),
  };
}

/** Documentos que nunca se mandan a leer: no traen los datos de la póliza. */
const EXCLUIDO =
  /condiciones|certificad|credencial|textos|acuse|endoso|listado|detalle de cobertura|carta.{0,4}bienvenida|anexo|\brc eua\b|(^|\/)pago[_/ ]|(^|\/)(c|t)_\d{6}|documentacion|reembolso|aviso/i;
const CARATULA = /caratula/i;
const POLIZA = /poliza/i;
/** Factura o recibo de la póliza (para la referencia de pago). Los avisos de cobro no se usan. */
const RECIBO = /(^|\/)fact_|factura|recibo/i;

/** Lo mínimo que hace falta de cada documento para elegir. */
export type DocumentoCandidato = { ruta: string; tamano: number };

/**
 * Elige qué documentos de la póliza se leen con IA: las carátulas (o, si no hay, los PDF de la
 * póliza), más un recibo o factura para la referencia de pago; la póliza de grupo (con formato de
 * negociación) no lleva factura: le bastan la carátula y el formato. Sin carátula ni póliza se toman
 * hasta tres documentos que no sean de apoyo. Respeta los límites de la lectura (10 MB cada uno,
 * 25 MB en total, como máximo 4 documentos).
 */
export function elegirDocumentos<T extends DocumentoCandidato>(docs: T[]): T[] {
  const utiles = docs.filter((d) => DOCUMENTO.has(extension(d.ruta)) && d.tamano > 0 && d.tamano <= OCR_MAX_BYTES);
  const texto = (d: T) => sinAcentos(d.ruta).toLowerCase();
  const candidatos = utiles.filter((d) => !EXCLUIDO.test(texto(d)) || CARATULA.test(texto(d)));

  const caratulas = candidatos.filter((d) => CARATULA.test(texto(d)));
  const polizas = candidatos.filter((d) => !CARATULA.test(texto(d)) && POLIZA.test(texto(d)) && !RECIBO.test(texto(d)));
  // De los recibos, primero la factura del portal y, de ella, la copia del cliente ("_C.pdf").
  const preferencia = (d: T) => (/(^|\/)fact_/i.test(texto(d)) ? 2 : 0) + (/_c\.pdf$/i.test(d.ruta) ? 1 : 0);
  const recibos = candidatos
    .filter((d) => RECIBO.test(texto(d)) && !CARATULA.test(texto(d)))
    .sort((a, b) => preferencia(b) - preferencia(a));
  const principales = caratulas.length ? caratulas.slice(0, 2) : polizas.slice(0, 2);
  const otros = principales.length
    ? []
    : candidatos.filter((d) => !RECIBO.test(texto(d))).slice(0, 3);

  const elegidos: T[] = [];
  let total = 0;
  const grupo = negociacionDe(docs) !== null;
  for (const d of [...principales, ...otros, ...(grupo ? [] : recibos.slice(0, 1))]) {
    if (elegidos.length >= 4 || total + d.tamano > OCR_MAX_BYTES_TOTAL) continue;
    elegidos.push(d);
    total += d.tamano;
  }
  return elegidos;
}

const NEGOCIACION = /formato.?de.?negociacion|orden.?de.?emision/i;

/**
 * Formato de negociación u orden de emisión de una póliza de grupo (GMM Colectivo): se lee aparte,
 * como en la captura normal, y se guarda como su archivo.
 */
export const negociacionDe = <T extends DocumentoCandidato>(docs: T[]) =>
  docs.find(
    (d) => extension(d.ruta) === "pdf" && d.tamano > 0 && d.tamano <= OCR_MAX_BYTES && NEGOCIACION.test(sinAcentos(d.ruta))
  ) ?? null;

/** El documento que se guarda como carátula de la póliza: el primer PDF elegido. */
export const caratulaDe = <T extends DocumentoCandidato>(elegidos: T[]) =>
  elegidos.find((d) => extension(d.ruta) === "pdf" && !RECIBO.test(sinAcentos(d.ruta).toLowerCase())) ?? null;
