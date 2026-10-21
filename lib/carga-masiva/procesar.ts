// Carga masiva (navegador): una póliza de principio a fin. Se leen sus documentos con IA, se revisa
// lo leído y, si no hay dudas, se guarda igual que en la captura normal con su carátula. Lo que
// tenga dudas queda "por revisar" con el formulario ya lleno.

import { aValoresIniciales } from "@/components/captura/captura-workspace";
import { combinarComplemento, datosParaGuardar, type PolizaFormInicial } from "@/components/captura/poliza-form";
import { ErrorZip } from "@/lib/archivos/zip";
import { esArchivoIlegible, MENSAJE_ARCHIVO_PERDIDO } from "@/lib/archivos/memoria";
import { subirArchivo } from "@/lib/archivos/subir";
import { caratulaDe, coincideNumero, elegirDocumentos, negociacionDe, type UnidadPoliza } from "@/lib/carga-masiva/agrupar";
import { guardarPolizaMasiva } from "@/lib/carga-masiva/actions";
import { comoArchivo, documentosDe, expedienteDe, type Fuente } from "@/lib/carga-masiva/fuente";
import { RFC_GENERICOS } from "@/lib/clientes/reglas";
import { rfcDeNombres } from "@/lib/ocr/rfc-de-archivo";
import type { ContextoOcr, ExtraccionPoliza, OcrRespuesta } from "@/lib/ocr/types";
import { camposGenerales, seccionesPorRamo, type Opcion } from "@/lib/polizas/ramos";
import { normalizarRfc } from "@/lib/polizas/validacion";

/** Datos del contratante que se muestran en la lista (el usuario pidió ver el RFC de cada una). */
type Contratante = { cliente: string; rfc: string; numero: string };

export type EstadoPoliza =
  | { tipo: "pendiente" }
  | { tipo: "leyendo" }
  | ({ tipo: "guardada"; polizaId: string; clienteId: string; aviso?: string } & Contratante)
  | ({
      tipo: "revisar";
      motivos: string[];
      inicial: PolizaFormInicial;
      /** Documentos leídos (referencias en la fuente) para mostrarlos al revisar. */
      documentos: string[];
      /** Formato de negociación de una póliza de grupo, que se guarda como su archivo. */
      negociacion?: string;
      /** El RFC quedó genérico: tiene su propio apartado. */
      rfcGenerico: boolean;
    } & Contratante)
  | ({ tipo: "ya_existia" } & Contratante)
  | { tipo: "sin_documentos" }
  | { tipo: "descartada" }
  | { tipo: "error"; mensaje: string };

const ETIQUETA_ARCHIVO = { caratula: "La carátula", negociacion: "El formato de negociación", expediente: "El expediente" };

/** La sesión venció: la carga se detiene para no marcar todo como error. */
export class SesionVencida extends Error {}

const ETIQUETAS = new Map(
  [...camposGenerales, ...Object.values(seccionesPorRamo).flatMap((s) => s.flatMap((x) => x.campos))].map((c) => [c.name, c.label])
);
const etiqueta = (campo: string) =>
  campo.startsWith("asegurados.") ? `Asegurado ${Number(campo.split(".")[1]) + 1}` : (ETIQUETAS.get(campo) ?? campo);

const espera = (ms: number, senal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    senal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Lectura con IA sin descontar escaneos del plan; reintenta si el proveedor está saturado. */
async function leerConIa(archivos: File[], senal: AbortSignal, contexto?: ContextoOcr): Promise<ExtraccionPoliza> {
  for (let intento = 0; ; intento++) {
    const body = new FormData();
    for (const a of archivos) body.append("files", a);
    body.append("masiva", "1");
    if (contexto) body.append("contexto", contexto);
    const res = await fetch("/api/ocr", { method: "POST", body, signal: senal });
    if (res.status === 401) throw new SesionVencida();
    const json = (await res.json().catch(() => ({ ok: false, error: "Respuesta inválida del servidor." }))) as OcrRespuesta;
    if (json.ok) return json.datos;
    // Límite de uso de la IA o una falla de red pasajera: se espera y se reintenta.
    if ([429, 502, 503, 504].includes(res.status) && intento < 4 && !senal.aborted) {
      await espera(res.status === 429 ? 30_000 * (intento + 1) : 8_000, senal);
      continue;
    }
    throw new Error(json.error);
  }
}

export async function procesarPoliza(
  unidad: UnidadPoliza,
  fuente: Fuente,
  { aseguradoras, ejecutivoId, senal }: { aseguradoras: Opcion[]; ejecutivoId: string | undefined; senal: AbortSignal }
): Promise<EstadoPoliza> {
  try {
    const docs = await documentosDe(unidad, fuente);
    const elegidos = elegirDocumentos(docs);
    if (elegidos.length === 0) return { tipo: "sin_documentos" };
    const archivos = await Promise.all(elegidos.map(async (d) => comoArchivo(await d.leer(), d.ruta)));

    const datos = await leerConIa(archivos, senal);
    let inicial = aValoresIniciales(datos, aseguradoras);
    const motivos = [...datos.advertencias];

    // Póliza de grupo: el formato de negociación se lee aparte, como en la captura normal, y
    // completa la empresa contratante, su RFC y las condiciones del subgrupo.
    const docNegociacion = inicial.ramo === "gmm_colectivo" ? negociacionDe(docs) : null;
    const negociacion = docNegociacion ? await comoArchivo(await docNegociacion.leer(), docNegociacion.ruta) : null;
    if (negociacion) {
      const complemento = await leerConIa([negociacion], senal, "gmm_colectivo");
      inicial = combinarComplemento(inicial, aValoresIniciales(complemento, aseguradoras));
      motivos.push(...complemento.advertencias.map((a) => `Formato de negociación: ${a}`));
    }

    // El RFC que siga sin venir (o venga genérico) se busca en los nombres de todos los archivos
    // de la póliza, p. ej. el ZIP de facturas "FACT_GUAH810713A3A_…".
    const g = { ...inicial.generales };
    const rfcLeido = normalizarRfc(g.rfcCliente ?? "");
    if (!rfcLeido || RFC_GENERICOS.has(rfcLeido)) {
      const hallado = rfcDeNombres([...unidad.archivos, ...docs.map((d) => d.ruta)]);
      if (hallado) g.rfcCliente = hallado.rfc;
    }
    inicial = { ...inicial, generales: g };
    const contratante: Contratante = {
      cliente: g.cliente ?? "",
      rfc: normalizarRfc(g.rfcCliente ?? ""),
      numero: g.numeroImpreso ?? "",
    };
    const rfcGenerico = RFC_GENERICOS.has(contratante.rfc);

    if (datos.generales.aseguradora && !g.aseguradora) {
      motivos.push(`La aseguradora «${datos.generales.aseguradora}» no está registrada en el CRM.`);
    }
    if (unidad.numero && !coincideNumero(unidad.numero, [g.numeroImpreso ?? "", g.polizaVigor ?? ""])) {
      motivos.push(`El número leído (${g.numeroImpreso || "ninguno"}) no coincide con el de «${unidad.nombre}».`);
    }
    if (rfcGenerico) motivos.push(`El RFC es genérico (${contratante.rfc}) y no se encontró el real en los nombres de los archivos.`);
    const revisar = (m: string[]) =>
      ({
        tipo: "revisar",
        motivos: m,
        inicial,
        documentos: elegidos.map((d) => d.ref),
        ...(docNegociacion && { negociacion: docNegociacion.ref }),
        rfcGenerico,
        ...contratante,
      }) as const;
    if (motivos.length > 0) return revisar(motivos);

    const res = await guardarPolizaMasiva({ ...datosParaGuardar(inicial, ejecutivoId), origen: "ocr" });
    if (!res.ok) {
      if (res.errores?.numeroImpreso?.startsWith("Ya existe")) return { tipo: "ya_existia", ...contratante };
      if (res.errores) return revisar(Object.entries(res.errores).map(([campo, m]) => `${etiqueta(campo)}: ${m}`));
      if (res.error?.startsWith("Tu sesión expiró")) throw new SesionVencida();
      return { tipo: "error", mensaje: res.error ?? "No se pudo guardar la póliza." };
    }

    // La póliza ya existe aunque un archivo falle: se puede subir después desde su detalle.
    const avisos: string[] = [];
    const caratula = caratulaDe(elegidos);
    const expediente = await expedienteDe(unidad, fuente);
    if (expediente && "omitido" in expediente) avisos.push(expediente.omitido);
    const subir = {
      caratula: caratula ? archivos[elegidos.indexOf(caratula)] : null,
      negociacion,
      expediente: expediente && "archivo" in expediente ? expediente.archivo : null,
    };
    for (const [tipo, archivo] of Object.entries(subir) as [keyof typeof subir, File | null][]) {
      if (!archivo) continue;
      const subida = await subirArchivo(res.poliza.id, tipo, archivo);
      if (!subida.ok) avisos.push(`${ETIQUETA_ARCHIVO[tipo]} no se subió: ${subida.error}`);
    }
    return {
      tipo: "guardada",
      polizaId: res.poliza.id,
      clienteId: res.cliente.id,
      ...contratante,
      numero: res.poliza.numero,
      ...(avisos.length > 0 && { aviso: avisos.join(" ") }),
    };
  } catch (e) {
    if (e instanceof SesionVencida || senal.aborted) throw e;
    if (e instanceof ErrorZip) return { tipo: "error", mensaje: e.message };
    if (esArchivoIlegible(e)) return { tipo: "error", mensaje: `Un archivo ${MENSAJE_ARCHIVO_PERDIDO}` };
    console.error("[carga masiva]", unidad.clave, e);
    return { tipo: "error", mensaje: e instanceof Error && e.message ? e.message : "Error inesperado." };
  }
}
