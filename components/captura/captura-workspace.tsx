"use client";

import * as React from "react";

import { OcrDropzone } from "@/components/captura/ocr-dropzone";
import {
  PolizaForm,
  type PolizaFormHandle,
  type PolizaFormInicial,
} from "@/components/captura/poliza-form";
import type { ExtraccionPoliza } from "@/lib/ocr/types";
import type { Opcion, Ramo } from "@/lib/polizas/ramos";

/** Primer PDF de los documentos leídos: es el que se guarda como archivo de la póliza. */
const primerPdf = (archivos: File[]) => archivos.find((a) => a.type === "application/pdf") ?? null;

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

function aValoresIniciales(datos: ExtraccionPoliza, aseguradoras: Opcion[]): PolizaFormInicial {
  // La IA devuelve el nombre de la aseguradora; el formulario necesita su id en BD.
  const nombre = datos.generales.aseguradora;
  const aseguradora = nombre
    ? aseguradoras.find((a) => normalizar(a.label) === normalizar(nombre))
    : undefined;
  return {
    ramo: datos.ramo ?? undefined,
    generales: { ...datos.generales, aseguradora: aseguradora?.value ?? "" },
    especificos: datos.especificos,
    asegurados: datos.asegurados,
    sumaAseguradaIlimitada: datos.sumaAseguradaIlimitada,
  };
}

/**
 * Renovación: lo que lee la IA de la carátula nueva manda, y lo que no trae se completa con la
 * vigencia anterior (contacto, datos del ramo, asegurados y su antigüedad).
 */
function combinarRenovacion(ocr: PolizaFormInicial, anterior: PolizaFormInicial): PolizaFormInicial {
  const conValor = (v: Record<string, string> | undefined) =>
    Object.fromEntries(Object.entries(v ?? {}).filter(([, valor]) => valor !== ""));
  const mismoRamo = !ocr.ramo || ocr.ramo === anterior.ramo;
  const antiguedades = new Map((anterior.asegurados ?? []).map((a) => [a.nombre.trim().toUpperCase(), a.antiguedad]));
  return {
    ramo: ocr.ramo ?? anterior.ramo,
    // La póliza vigor es la de la cadena, aunque la IA lea otra.
    generales: { ...anterior.generales, ...conValor(ocr.generales), polizaVigor: anterior.generales?.polizaVigor ?? "" },
    especificos: mismoRamo ? { ...anterior.especificos, ...conValor(ocr.especificos) } : ocr.especificos,
    asegurados: ocr.asegurados?.length
      ? ocr.asegurados.map((a) => ({ ...a, antiguedad: a.antiguedad || antiguedades.get(a.nombre.trim().toUpperCase()) || "" }))
      : anterior.asegurados,
    sumaAseguradaIlimitada: ocr.sumaAseguradaIlimitada ?? anterior.sumaAseguradaIlimitada,
    // La renovación sigue en la cartera del mismo ejecutivo.
    ejecutivoId: anterior.ejecutivoId,
  };
}

export function CapturaWorkspace({
  aseguradoras,
  verComisiones,
  ejecutivos,
  ejecutivoPredeterminado,
  renovacion,
}: {
  aseguradoras: Opcion[];
  /** Solo ADMIN captura el % de comisión personalizado. */
  verComisiones: boolean;
  /** Cuentas a las que se puede asignar la póliza (sin ella no hay selector). */
  ejecutivos?: { id: string; nombre: string }[];
  ejecutivoPredeterminado?: string;
  /** Captura de la renovación de una póliza, con sus datos precargados. */
  renovacion?: { anterior: { id: string; numero: string }; inicial: PolizaFormInicial };
}) {
  // `version` remonta el formulario para que tome los valores extraídos como estado inicial.
  const [prellenado, setPrellenado] = React.useState<{
    version: number;
    inicial?: PolizaFormInicial;
  }>({ version: 0, inicial: renovacion?.inicial });
  const [extrayendo, setExtrayendo] = React.useState(false);
  // Documentos leídos por la IA: el primer PDF se guarda como carátula de la póliza.
  // Las imágenes y los demás documentos se usan solo para la lectura.
  const [caratula, setCaratula] = React.useState<File | null>(null);
  // Cambiar `ronda` remonta el panel de captura para dejarlo vacío.
  const [ronda, setRonda] = React.useState(0);
  // Ramo seleccionado en el formulario: GMM Colectivo habilita el segundo documento.
  const [ramo, setRamo] = React.useState<Ramo>("autos");
  const [leyendoComplemento, setLeyendoComplemento] = React.useState(false);
  // PDF del formato de negociación: se guarda como tercer archivo de la póliza.
  const [negociacion, setNegociacion] = React.useState<File | null>(null);
  const formRef = React.useRef<PolizaFormHandle>(null);
  // La IA llenó el formulario: queda registrado en el historial de la póliza.
  const [leidaConIa, setLeidaConIa] = React.useState(false);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="xl:sticky xl:top-20">
        <OcrDropzone
          key={ronda}
          onProcesando={(procesando) => {
            setExtrayendo(procesando);
            // Un documento nuevo reemplaza al anterior aunque su lectura falle.
            if (procesando) setCaratula(null);
          }}
          onLimpiar={() => setCaratula(null)}
          onAplicar={(datos, archivos) => {
            setCaratula(primerPdf(archivos));
            setLeidaConIa(true);
            const leidos = aValoresIniciales(datos, aseguradoras);
            setPrellenado((p) => ({
              version: p.version + 1,
              inicial: renovacion ? combinarRenovacion(leidos, renovacion.inicial) : leidos,
            }));
          }}
        />
        {ramo === "gmm_colectivo" && (
          <div className="mt-4">
            <OcrDropzone
              key={`complemento-${ronda}`}
              contexto="gmm_colectivo"
              titulo="Subir Formato de Negociación / Orden de Emisión (Opcional)"
              descripcion="Complementa la carátula: la IA toma la empresa contratante, la póliza, las vigencias y resume las reglas del plan en Condiciones del Subgrupo."
              onProcesando={(procesando) => {
                setLeyendoComplemento(procesando);
                if (procesando) setNegociacion(null);
              }}
              onLimpiar={() => setNegociacion(null)}
              // Se integra a lo ya capturado en lugar de reemplazar el formulario.
              onAplicar={(datos, archivos) => {
                setNegociacion(primerPdf(archivos));
                setLeidaConIa(true);
                formRef.current?.aplicarComplemento(aValoresIniciales(datos, aseguradoras));
              }}
            />
          </div>
        )}
      </div>
      <PolizaForm
        key={prellenado.version}
        inicial={prellenado.inicial}
        aseguradoras={aseguradoras}
        verComisiones={verComisiones}
        ejecutivos={ejecutivos}
        ejecutivoPredeterminado={ejecutivoPredeterminado}
        modo={renovacion ? { tipo: "renovacion", anterior: renovacion.anterior } : undefined}
        ref={formRef}
        extrayendo={extrayendo || leyendoComplemento}
        leidaConIa={leidaConIa}
        onRamoChange={setRamo}
        caratula={caratula}
        // Solo aplica mientras el ramo sea GMM Colectivo (el panel se oculta con otro ramo).
        negociacion={ramo === "gmm_colectivo" ? negociacion : null}
        onReiniciar={() => {
          setCaratula(null);
          setExtrayendo(false);
          setLeyendoComplemento(false);
          setNegociacion(null);
          setLeidaConIa(false);
          setRonda((r) => r + 1);
        }}
      />
    </div>
  );
}
