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

const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const extension = (ruta: string) => ruta.slice(ruta.lastIndexOf(".") + 1).toLowerCase();
const DOCUMENTO = new Set(["pdf", "png", "jpg", "jpeg", "webp"]);

const VIGENCIA = /^\d{2}\s*-\s*\d{2}\s+\S/;
/** Subcarpetas que marcan a su carpeta madre como una póliza descargada del portal. */
const SUBCARPETA_POLIZA = /^(caratula|poliza)s?$/i;
/** Carpetas con documentos de apoyo: sueltas no son una póliza. */
const CARPETA_APOYO = /^(certificados|credenciales|condiciones generales|textos|acuse.*|ac|endosos?|listado|detalle de coberturas|carta bienvenida|aviso pago|pago|factura)$/i;
/** ZIP sueltos que solo traen facturas o pagos. */
const ZIP_SOLO_COBRANZA = /^(fact|pago|aviso)_/i;

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

/** Parte la lista de archivos en pólizas. */
export function agruparPolizas(archivos: ArchivoRuta[]): { unidades: UnidadPoliza[]; omitidos: Omitido[] } {
  const partes = archivos.map((a) => ({ ...a, segmentos: a.ruta.split("/").filter(Boolean) }));

  // Carpetas que son una póliza: por su nombre o por tener una subcarpeta Carátula / Póliza.
  const carpetasPoliza = new Set<string>();
  for (const { segmentos } of partes) {
    for (let i = 0; i < segmentos.length - 1; i++) {
      const ruta = segmentos.slice(0, i + 1).join("/");
      if (VIGENCIA.test(segmentos[i])) carpetasPoliza.add(ruta);
      if (i > 0 && SUBCARPETA_POLIZA.test(sinAcentos(segmentos[i]))) carpetasPoliza.add(segmentos.slice(0, i).join("/"));
    }
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
      if (ZIP_SOLO_COBRANZA.test(nombre)) omitidos.push({ ruta: a.ruta, motivo: "Solo trae facturas o pagos" });
      else
        unidades.push({
          clave: a.ruta,
          nombre: nombre.replace(/\.zip$/i, ""),
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
    } else if (!/^(desktop\.ini|\.ds_store|thumbs\.db)$/i.test(nombre) && ext !== "xml") {
      omitidos.push({ ruta: a.ruta, motivo: "No es PDF, imagen ni ZIP" });
    }
  }

  for (const [carpeta, rutas] of porCarpeta) {
    const nombre = carpeta.split("/").at(-1) ?? carpeta;
    unidades.push({ clave: carpeta, nombre, tipo: "carpeta", archivos: rutas, numero: numeroDeNombre(nombre), copias: [] });
  }

  // PDFs sueltos: los de una misma carpeta con el mismo número son una sola póliza.
  for (const [madre, sueltos] of sueltosPorCarpeta) {
    const grupos = new Map<string, ArchivoRuta[]>();
    for (const s of sueltos) {
      const clave = numeroDeNombre(s.ruta.split("/").at(-1) ?? "") ?? `archivo:${s.ruta}`;
      grupos.set(clave, [...(grupos.get(clave) ?? []), s]);
    }
    for (const [numero, grupo] of grupos) {
      const solo = grupo.length === 1;
      const nombreArchivo = grupo[0].ruta.split("/").at(-1) ?? grupo[0].ruta;
      unidades.push({
        clave: solo ? grupo[0].ruta : `${madre}/#${numero}`,
        nombre: solo ? nombreArchivo.replace(/\.[^.]+$/, "") : `${madre.split("/").at(-1) ?? ""} · ${numero}`.trim(),
        tipo: "pdf",
        archivos: grupo.map((g) => g.ruta),
        numero: numero.startsWith("archivo:") ? null : numero,
        copias: [],
      });
    }
  }

  // La misma póliza guardada en varias carpetas (p. ej. "enviado" y "CRM 27 03 2024"): se procesa
  // la copia con más archivos. Dos carpetas de la misma vigencia y número son la misma póliza
  // aunque el número venga con ceros ("23-24 679535 …" y "23-24 0000679535 …").
  const porNombre = new Map<string, UnidadPoliza>();
  for (const u of unidades.sort((a, b) => b.archivos.length - a.archivos.length || a.clave.localeCompare(b.clave))) {
    const vigencia = u.tipo === "carpeta" ? /^(\d{2})\s*-\s*(\d{2})/.exec(u.nombre) : null;
    const clave =
      vigencia && u.numero
        ? `vigencia|${vigencia[1]}-${vigencia[2]}|${u.numero}`
        : `${u.tipo}|${sinAcentos(u.nombre).toUpperCase().replace(/\s+/g, " ").trim()}`;
    const original = porNombre.get(clave);
    if (original) original.copias.push(u.clave);
    else porNombre.set(clave, u);
  }
  return {
    unidades: [...porNombre.values()].sort((a, b) => a.clave.localeCompare(b.clave, "es")),
    omitidos,
  };
}

/** Documentos que nunca se mandan a leer: no traen los datos de la póliza. */
const EXCLUIDO =
  /condiciones|certificad|credencial|textos|acuse|endoso|listado|detalle de cobertura|carta.{0,4}bienvenida|anexo|\brc eua\b|(^|\/)pago[_/ ]|(^|\/)(c|t)_\d{6}|documentacion|reembolso/i;
const CARATULA = /caratula/i;
const POLIZA = /poliza/i;
const RECIBO = /(^|\/)fact_|recibo|aviso.?(de.?)?(pago|cobro)|(^|\/)aviso_/i;

/** Lo mínimo que hace falta de cada documento para elegir. */
export type DocumentoCandidato = { ruta: string; tamano: number };

/**
 * Elige qué documentos de la póliza se leen con IA: las carátulas (o, si no hay, los PDF de la
 * póliza), más un recibo o factura para la referencia de pago. Sin carátula ni póliza se toman
 * hasta tres documentos que no sean de apoyo. Respeta los límites de la lectura (10 MB cada uno,
 * 25 MB en total, como máximo 4 documentos).
 */
export function elegirDocumentos<T extends DocumentoCandidato>(docs: T[]): T[] {
  const utiles = docs.filter((d) => DOCUMENTO.has(extension(d.ruta)) && d.tamano > 0 && d.tamano <= OCR_MAX_BYTES);
  const texto = (d: T) => sinAcentos(d.ruta).toLowerCase();
  const candidatos = utiles.filter((d) => !EXCLUIDO.test(texto(d)) || CARATULA.test(texto(d)));

  const caratulas = candidatos.filter((d) => CARATULA.test(texto(d)));
  const polizas = candidatos.filter((d) => !CARATULA.test(texto(d)) && POLIZA.test(texto(d)) && !RECIBO.test(texto(d)));
  // De los recibos, primero la copia del cliente ("_C.pdf").
  const recibos = candidatos
    .filter((d) => RECIBO.test(texto(d)) && !CARATULA.test(texto(d)))
    .sort((a, b) => Number(/_c\.pdf$/i.test(b.ruta)) - Number(/_c\.pdf$/i.test(a.ruta)));
  const principales = caratulas.length ? caratulas.slice(0, 2) : polizas.slice(0, 2);
  const otros = principales.length
    ? []
    : candidatos.filter((d) => !RECIBO.test(texto(d))).slice(0, 3);

  const elegidos: T[] = [];
  let total = 0;
  for (const d of [...principales, ...otros, ...recibos.slice(0, 1)]) {
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
