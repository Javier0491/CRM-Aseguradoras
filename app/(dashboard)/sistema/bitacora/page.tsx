import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, SearchX } from "lucide-react";

import { BusquedaUrl } from "@/components/layout/busqueda-url";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { ACCIONES_BITACORA, type AccionBitacora } from "@/lib/bitacora/registrar";
import { ENTIDADES_BITACORA, esEntidadBitacora, getBitacora, LIMITE_BITACORA } from "@/lib/bitacora/queries";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Bitácora",
};

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

/** Enlace al registro afectado, cuando tiene pantalla propia. */
function enlace(entidad: string, id: string | null) {
  if (!id) return null;
  if (entidad === "poliza") return `/polizas/${id}`;
  if (entidad === "lote") return "/conciliacion";
  if (entidad === "recibo") return "/conciliacion/aclaraciones";
  if (entidad === "regla_comision") return "/configuracion/comisiones";
  if (entidad === "usuario") return "/sistema/usuarios";
  return null;
}

const colorAccion = (accion: string) =>
  accion.endsWith("eliminar") || accion.endsWith("revertir")
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : accion.startsWith("conciliacion") || accion.startsWith("aclaracion")
      ? "border-primary/30 bg-primary/10 text-primary"
      : "text-muted-foreground";

export default async function BitacoraPage({ searchParams }: PageProps<"/sistema/bitacora">) {
  await requireAdmin();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const entidad = esEntidadBitacora(params.entidad) ? params.entidad : undefined;
  const { registros, total } = await getBitacora({ q, entidad });

  const filtro = (valor?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (valor) p.set("entidad", valor);
    const s = p.toString();
    return s ? `/sistema/bitacora?${s}` : "/sistema/bitacora";
  };

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bitácora</h1>
        <p className="text-sm text-muted-foreground">
          Quién hizo qué y cuándo: conciliaciones, aclaraciones, pólizas, matriz de comisiones y usuarios.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <BusquedaUrl q={q} placeholder="Buscar por descripción o usuario" etiqueta="Buscar en la bitácora" />
        <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
          {[{ valor: undefined, label: "Todo" }, ...Object.entries(ENTIDADES_BITACORA).map(([valor, label]) => ({ valor, label }))].map(
            ({ valor, label }) => (
              <Link
                key={label}
                href={filtro(valor)}
                aria-current={entidad === valor ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary/50",
                  entidad === valor ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground"
                )}
              >
                {label}
              </Link>
            )
          )}
        </nav>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="size-4 text-primary" /> Movimientos
          </CardTitle>
          <CardDescription>
            {formatNumero(total)} {total === 1 ? "movimiento" : "movimientos"}
            {total > registros.length && ` · se muestran los ${LIMITE_BITACORA} más recientes`}
          </CardDescription>
        </CardHeader>
        {registros.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <SearchX className="size-7 text-muted-foreground" />
            <p className="font-medium">{q || entidad ? "Ningún movimiento coincide" : "Aún no hay movimientos"}</p>
            <p className="text-sm text-muted-foreground">
              Se registran desde que se activó la bitácora; lo anterior no quedó guardado.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-44 pl-5">Fecha</TableHead>
                <TableHead className="w-52">Usuario</TableHead>
                <TableHead className="w-52">Acción</TableHead>
                <TableHead className="pr-5">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((r) => {
                const href = enlace(r.entidad, r.entidad_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="pl-5 text-xs whitespace-nowrap tabular-nums">
                      {fechaHora.format(r.created_at)}
                    </TableCell>
                    <TableCell className="max-w-52 truncate text-xs">{r.usuario_email ?? "Sistema"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", colorAccion(r.accion))}>
                        {ACCIONES_BITACORA[r.accion as AccionBitacora] ?? r.accion}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-sm whitespace-normal">
                      {href ? (
                        <Link href={href} className="hover:text-primary hover:underline">
                          {r.descripcion}
                        </Link>
                      ) : (
                        r.descripcion
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
