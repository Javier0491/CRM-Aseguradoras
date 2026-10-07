import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { VistaCliente } from "@/components/clientes/vista-cliente";
import { VistaDashboard } from "@/components/dashboard/vista-dashboard";
import { BarraDatosDev } from "@/components/dev/barra-datos-dev";
import { VistaPoliza } from "@/components/polizas/vista-poliza";
import { esPestana, VistaPolizas } from "@/components/polizas/vista-polizas";
import { VistaRenovaciones } from "@/components/renovaciones/vista-renovaciones";
import { VistaSuperadmin } from "@/components/superadmin/vista-superadmin";
import { VistaTareasPagina } from "@/components/tareas/vista-tareas";
import {
  CONJUNTOS,
  datosCliente,
  datosDashboard,
  datosPoliza,
  datosPolizas,
  datosRenovaciones,
  datosSuperadmin,
  datosTareas,
  esConjunto,
  type Conjunto,
} from "@/lib/dev/datos-extremos";
import { COLUMNAS_EMBUDO, type ColumnaEmbudo } from "@/lib/renovaciones/reglas";

const esColumna = (v: unknown): v is ColumnaEmbudo => COLUMNAS_EMBUDO.some((c) => c.clave === v);

export const metadata: Metadata = {
  title: "Datos de prueba",
};

const PANTALLAS = [
  { clave: "polizas", titulo: "Pólizas" },
  { clave: "poliza", titulo: "Expediente de póliza" },
  { clave: "cliente", titulo: "Expediente de cliente" },
  { clave: "renovaciones", titulo: "Renovaciones" },
  { clave: "dashboard", titulo: "Dashboard" },
  { clave: "tareas", titulo: "Tareas (Líder de oficina)" },
  { clave: "superadmin", titulo: "Cobranza de la plataforma" },
] as const;
type Pantalla = (typeof PANTALLAS)[number]["clave"];

/**
 * Galería de desarrollo: cada pantalla principal con datos de prueba (normal, peor caso, vacío,
 * uno y masivo) para revisar cómo aguanta el diseño. Solo existe en desarrollo y no toca la base
 * ni la sesión; los datos salen de lib/dev/datos-extremos.ts.
 */
export default async function DatosDePruebaPage({ searchParams }: PageProps<"/dev/datos-extremos">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const pantalla: Pantalla = PANTALLAS.find((p) => p.clave === params.pantalla)?.clave ?? "polizas";
  const conjunto: Conjunto = esConjunto(params.datos) ? params.datos : "extremos";
  const tema = params.tema === "claro" ? "light" : "dark";
  const pestana = esPestana(params.tab) ? params.tab : "polizas";
  // "pol0:cotizando": simula mover esa tarjeta del embudo a otra columna.
  const [moverId, moverColumna] = typeof params.mover === "string" ? params.mover.split(":") : [];
  const mover = moverId && esColumna(moverColumna) ? { id: moverId, columna: moverColumna } : undefined;

  const href = (cambio: Record<string, string>) => {
    const p = new URLSearchParams({ pantalla, datos: conjunto, tema: tema === "light" ? "claro" : "oscuro", tab: pestana, ...cambio });
    if (p.get("tab") === "polizas") p.delete("tab");
    return `/dev/datos-extremos?${p}`;
  };

  const vistas: Record<Pantalla, () => React.ReactNode> = {
    polizas: () => <VistaPolizas {...datosPolizas(conjunto, pestana)} />,
    poliza: () => <VistaPoliza {...datosPoliza(conjunto)} />,
    cliente: () => <VistaCliente {...datosCliente(conjunto)} />,
    renovaciones: () => <VistaRenovaciones {...datosRenovaciones(conjunto, mover)} />,
    dashboard: () => <VistaDashboard {...datosDashboard(conjunto)} />,
    tareas: () => <VistaTareasPagina {...datosTareas(conjunto)} />,
    superadmin: () => <VistaSuperadmin {...datosSuperadmin(conjunto)} />,
  };

  return (
    <>
      {pantalla === "superadmin" ? (
        // Mismo contenedor que el layout de la plataforma.
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 pt-16 pb-24 md:p-8 md:pb-24">
          {vistas[pantalla]()}
        </main>
      ) : (
        <div className="flex min-h-svh">
          {/* El lugar de la barra lateral del CRM (16rem desde md), para que el contenido tenga su ancho real. */}
          <div aria-hidden className="hidden w-64 shrink-0 border-r bg-sidebar md:block" />
          <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 pt-16 pb-24 md:p-6 md:pb-24">{vistas[pantalla]()}</main>
        </div>
      )}
      <BarraDatosDev
        pantallas={PANTALLAS}
        pantalla={pantalla}
        conjuntos={CONJUNTOS}
        conjunto={conjunto}
        tema={tema}
        hrefs={{
          pantallas: Object.fromEntries(PANTALLAS.map((p) => [p.clave, href({ pantalla: p.clave, tab: "polizas" })])),
          conjuntos: Object.fromEntries(CONJUNTOS.map((c) => [c.clave, href({ datos: c.clave })])),
          tema: href({ tema: tema === "light" ? "oscuro" : "claro" }),
        }}
      />
    </>
  );
}
