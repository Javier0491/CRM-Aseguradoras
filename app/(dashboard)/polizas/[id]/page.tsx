import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileArchive, FileText, FolderOpen } from "lucide-react";

import { ArchivoUploader } from "@/components/archivos/archivo-uploader";
import { EliminarPoliza } from "@/components/polizas/eliminar-poliza";
import {
  AseguradoraTag,
  estadoRecibo,
  formaPagoLabel,
  ramoLabel,
  Vencimiento,
} from "@/components/polizas/poliza-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ARCHIVOS,
  COLUMNAS_ARCHIVO,
  formatBytes,
  TIPOS_ARCHIVO,
  type TipoArchivo,
} from "@/lib/archivos/config";
import { esAdmin, requireUser } from "@/lib/auth/dal";
import { formatFecha, formatMoneda, formatNumero, hoyISO } from "@/lib/format";
import { parentescoLabels, type Parentesco } from "@/lib/polizas/asegurados";
import { getPolizaDetalle } from "@/lib/polizas/queries";
import { ramoDesdeDb, seccionesPorRamo, type CampoDef } from "@/lib/polizas/ramos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Detalle de póliza",
};

export default async function PolizaDetallePage({ params }: PageProps<"/polizas/[id]">) {
  const { id } = await params;
  const poliza = await getPolizaDetalle(id);
  if (!poliza) notFound();
  const hoy = hoyISO();
  // La comisión es la ganancia del broker: solo la ve el rol ADMIN.
  const verComisiones = esAdmin(await requireUser());

  const datos: { label: string; valor: string; mono?: boolean }[] = [
    { label: "Cliente", valor: poliza.cliente.nombre },
    { label: "RFC", valor: poliza.cliente.rfc, mono: true },
    { label: "Teléfono", valor: poliza.cliente.telefono, mono: true },
    { label: "Correo", valor: poliza.cliente.email },
    { label: "Vigencia", valor: `${formatFecha(poliza.vigencia_inicio)} – ${formatFecha(poliza.vigencia_fin)}` },
    { label: "Prima total", valor: formatMoneda(Number(poliza.prima_total)) },
    { label: "Forma de pago", valor: formaPagoLabel[poliza.forma_pago] },
    ...(verComisiones
      ? [
          {
            label: "Comisión",
            valor:
              poliza.comision_personalizada_pct !== null
                ? `${Number(poliza.comision_personalizada_pct)}% (personalizada)`
                : "Según la matriz de comisiones",
          },
        ]
      : []),
    { label: "Registrada", valor: formatFecha(poliza.created_at) },
  ];

  return (
    <>
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/polizas">
            <ArrowLeft /> Pólizas
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-xl font-semibold tracking-tight">{poliza.numeroImpreso}</h1>
            <p className="text-sm text-muted-foreground">
              Póliza vigor{" "}
              <span className="font-mono text-primary">{poliza.polizaVigor ?? "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <AseguradoraTag nombre={poliza.aseguradora.nombre} color={poliza.aseguradora.color_hex} />
            <Badge variant="outline">{ramoLabel[poliza.ramo]}</Badge>
            <EliminarPoliza
              polizaId={poliza.id}
              numero={poliza.numeroImpreso}
              recibos={poliza.recibos.length}
              conciliados={poliza.recibos.filter((r) => r.estado === "CONCILIADO").length}
              asegurados={poliza.asegurados.length}
              archivos={[poliza.caratula_nombre, poliza.negociacion_nombre, poliza.expediente_nombre].filter(
                (n): n is string => Boolean(n)
              )}
            />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datos de la póliza</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {datos.map((d) => (
                  <div key={d.label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{d.label}</dt>
                    <dd className={cn("truncate text-sm font-medium", d.mono && "font-mono")}>
                      {d.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <DatosRamo ramo={poliza.ramo} datos={poliza.datos_ramo} />

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Asegurados · {poliza.asegurados.length}</CardTitle>
            </CardHeader>
            {poliza.asegurados.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Sin asegurados registrados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Nombre</TableHead>
                    <TableHead>Parentesco</TableHead>
                    <TableHead>Sexo</TableHead>
                    <TableHead className="text-right">Edad</TableHead>
                    <TableHead>Nacimiento</TableHead>
                    <TableHead className="pr-5">Antigüedad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poliza.asegurados.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-5 font-medium">{a.nombre}</TableCell>
                      <TableCell>
                        {parentescoLabels[a.parentesco as Parentesco] ?? a.parentesco}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.sexo ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.edad ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {a.fecha_nacimiento ? formatFecha(`${a.fecha_nacimiento}T00:00:00Z`) : "—"}
                      </TableCell>
                      <TableCell className="pr-5 text-muted-foreground">{a.antiguedad ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="text-base">Recibos</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Recibo</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="pr-5">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poliza.recibos.map((r) => {
                  const estado = estadoRecibo[r.estado];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-5 text-muted-foreground tabular-nums">
                        {r.numero}/{poliza.recibos.length}
                      </TableCell>
                      <TableCell>
                        <Vencimiento fecha={r.fecha_vencimiento} estado={r.estado} hoy={hoy} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoneda(Number(r.monto))}
                      </TableCell>
                      <TableCell className="pr-5">
                        <Badge variant="outline" className={estado.className}>
                          {estado.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="size-4 text-primary" />
              Documentos
            </CardTitle>
            <CardDescription>Carátula y expediente de respaldo de la póliza.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {TIPOS_ARCHIVO.filter(
              // El formato de negociación solo aplica a GMM Colectivo (o si ya existe).
              (tipo) =>
                tipo !== "negociacion" ||
                poliza.ramo === "GMM_COLECTIVO" ||
                poliza.negociacion_path !== null
            ).map((tipo) => {
              const c = COLUMNAS_ARCHIVO[tipo];
              return (
                <DocumentoPoliza
                  key={tipo}
                  polizaId={poliza.id}
                  tipo={tipo}
                  archivo={{ nombre: poliza[c.nombre], bytes: poliza[c.bytes], subido: poliza[c.subido] }}
                />
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DocumentoPoliza({
  polizaId,
  tipo,
  archivo,
}: {
  polizaId: string;
  tipo: TipoArchivo;
  archivo: { nombre: string | null; bytes: number | null; subido: Date | null };
}) {
  const def = ARCHIVOS[tipo];
  const Icono = def.verEnLinea ? FileText : FileArchive;
  // Enlaces normales (no <Link>): la ruta responde con una redirección a Storage.
  const href = `/polizas/${polizaId}/archivos/${tipo}`;

  return (
    <section className="space-y-3 py-4 first:pt-0 last:pb-0">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icono className="size-4 text-muted-foreground" />
        {def.etiqueta}
      </h3>
      {archivo.nombre ? (
        <>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="truncate text-sm font-medium">{archivo.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(archivo.bytes ?? 0)}
              {archivo.subido && ` · subido el ${formatFecha(archivo.subido)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {def.verEnLinea ? (
              <>
                <Button asChild size="sm">
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> {TEXTO_VER[tipo] ?? "Ver"}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`${href}?descargar=1`} download>
                    <Download /> Descargar {def.extension.toUpperCase()}
                  </a>
                </Button>
              </>
            ) : (
              <Button asChild size="sm">
                <a href={href} download>
                  <Download /> Descargar {def.extension.toUpperCase()}
                </a>
              </Button>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Reemplazar archivo
            </summary>
            <div className="pt-3">
              <ArchivoUploader polizaId={polizaId} tipo={tipo} reemplazar />
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Sin archivo.</p>
          <ArchivoUploader polizaId={polizaId} tipo={tipo} />
        </>
      )}
    </section>
  );
}

const TEXTO_VER: Partial<Record<TipoArchivo, string>> = {
  caratula: "Ver carátula",
  negociacion: "Ver formato",
};

/** Muestra un valor guardado en datos_ramo según el tipo de su campo. */
function formatearValor(campo: CampoDef | undefined, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = typeof valor === "number" ? valor : Number(valor);
  switch (campo?.type) {
    case "currency":
      return Number.isFinite(n) ? formatMoneda(n) : String(valor);
    case "percent":
      return `${String(valor)} %`;
    // "number" (año, plazo, asegurados…) se muestra tal cual: sin separador de miles ("2025", no "2,025").
    case "date":
      return typeof valor === "string" ? formatFecha(`${valor}T00:00:00Z`) : String(valor);
    default:
      return String(valor);
  }
}

const humanizar = (clave: string) =>
  clave.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/**
 * Campos específicos del ramo (datos_ramo), con las mismas secciones y etiquetas que el
 * formulario de captura. Lo que no corresponde a un campo actual (p. ej. datos de una
 * versión anterior del formulario) se muestra en "Otros datos" para no ocultarlo.
 */
function DatosRamo({ ramo, datos }: { ramo: string; datos: unknown }) {
  const valores =
    typeof datos === "object" && datos !== null && !Array.isArray(datos)
      ? (datos as Record<string, unknown>)
      : {};
  const clave = ramoDesdeDb(ramo);
  const secciones = clave ? seccionesPorRamo[clave] : [];
  const conocidos = new Set(secciones.flatMap((s) => s.campos.map((c) => c.name)));

  const bloques = [
    ...secciones.map((s) => ({
      titulo: s.titulo,
      filas: s.campos
        // La unidad se muestra junto a su cantidad ("2,000 UMAM"), no en una fila aparte.
        .filter((c) => !(c.name.endsWith("Unidad") && conocidos.has(c.name.replace(/Unidad$/, "Valor"))))
        .map((c) => {
          const unidad = c.name.endsWith("Valor") ? valores[c.name.replace(/Valor$/, "Unidad")] : undefined;
          const valor =
            unidad !== undefined && valores[c.name] !== undefined && valores[c.name] !== ""
              ? `${formatNumero(Number(valores[c.name]))} ${String(unidad)}`
              : formatearValor(c, valores[c.name]);
          return { campo: c, label: c.label, valor };
        })
        .filter((f) => f.valor),
    })),
    {
      titulo: "Otros datos",
      filas: Object.keys(valores)
        .filter((k) => !conocidos.has(k))
        .map((k) => ({ campo: undefined, label: humanizar(k), valor: formatearValor(undefined, valores[k]) }))
        .filter((f) => f.valor),
    },
  ].filter((b) => b.filas.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos del ramo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {bloques.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos específicos del ramo.</p>
        ) : (
          bloques.map((b) => (
            <section key={b.titulo} className="space-y-3">
              <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {b.titulo}
              </h3>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {b.filas.map((f) => {
                  const largo = f.campo?.type === "textarea";
                  return (
                    <div key={f.label} className={cn("min-w-0", (largo || f.campo?.wide) && "sm:col-span-2")}>
                      <dt className="text-xs text-muted-foreground">{f.label}</dt>
                      <dd
                        className={cn(
                          "text-sm font-medium",
                          largo
                            ? "mt-1 rounded-lg border bg-background/60 p-3 font-normal whitespace-pre-line"
                            : "truncate"
                        )}
                      >
                        {f.valor}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
