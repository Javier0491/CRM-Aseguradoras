import Link from "next/link";
import { ArrowUpRight, CalendarClock, FilePlus2, Mail, MessageCircle, Phone, SearchX, UserRound, Users } from "lucide-react";

import { NumeroAnimado } from "@/components/dashboard/numero-animado";
import { AvatarIniciales, colorDeNombre } from "@/components/layout/avatar-iniciales";
import { numeroWhatsApp } from "@/components/layout/barra-acciones-movil";
import { BarraProporcion } from "@/components/layout/barra-proporcion";
import { BusquedaUrl } from "@/components/layout/busqueda-url";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { FiltroEjecutivo } from "@/components/layout/filtro-ejecutivo";
import { Inclinable } from "@/components/layout/inclinable";
import { SelectorVista } from "@/components/layout/selector-vista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { getClientesListado } from "@/lib/clientes/queries";
import { diasDesdeHoy, formatFecha, formatMoneda, formatNumero } from "@/lib/format";
import type { OpcionEjecutivo } from "@/lib/usuarios/queries";
import type { VistaListado } from "@/lib/vista-listado";
import { cn } from "@/lib/utils";

type Listado = Awaited<ReturnType<typeof getClientesListado>>;
type ClienteListado = Listado["clientes"][number];

export type DatosClientes = {
  listado: Listado;
  /** Para filtrar por ejecutivo; no viene para quien solo ve su cartera. */
  ejecutivos?: OpcionEjecutivo[];
  filtros: { q: string; ejecutivo: string };
  usuarioId: string;
  vista: VistaListado;
  /** Límite de clientes por consulta, para el aviso. */
  limite: number;
  hoy: string;
};

/** Días antes del vencimiento en que la tarjeta lo destaca. */
const DIAS_AVISO_VENCIMIENTO = 30;

function SinDato() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

/** Directorio de clientes: en tarjetas grandes o en lista. La página carga los datos. */
export function VistaClientes({ listado, ejecutivos, filtros, usuarioId, vista, limite, hoy }: DatosClientes) {
  const { clientes, total, totalGeneral } = listado;
  const { q, ejecutivo } = filtros;

  return (
    <>
      <EncabezadoModulo
        icono={Users}
        titulo="Directorio de Clientes"
        descripcion={
          <>
            {formatNumero(totalGeneral)} {totalGeneral === 1 ? "cliente registrado" : "clientes registrados"}. Se
            agregan al capturar su primera póliza.
          </>
        }
        acciones={
          <Button asChild>
            <Link href="/captura">
              <FilePlus2 /> Nueva póliza
            </Link>
          </Button>
        }
      />

      {totalGeneral === 0 ? (
        <Card className="border-dashed py-0">
          <EstadoVacio
            icono={Users}
            titulo="Aún no hay clientes registrados"
            descripcion="Captura una póliza y su contratante aparecerá aquí."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <BusquedaUrl q={q} placeholder="Buscar por nombre, RFC, teléfono o correo" etiqueta="Buscar clientes" />
            <div className="flex items-center gap-2 sm:ml-auto">
              {ejecutivos && <FiltroEjecutivo ejecutivos={ejecutivos} usuarioId={usuarioId} valor={ejecutivo} />}
              <SelectorVista listado="clientes" vista={vista} />
            </div>
          </div>

          {clientes.length === 0 ? (
            <Card className="py-0">
              <EstadoVacio
                icono={SearchX}
                tono="muted"
                titulo="Ningún cliente coincide con la búsqueda"
                descripcion="Prueba con otro nombre, RFC, dato de contacto o ejecutivo."
              />
            </Card>
          ) : vista === "tarjetas" ? (
            <section aria-label="Clientes" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {clientes.map((c, i) => (
                <TarjetaCliente key={c.id} c={c} hoy={hoy} orden={i} verEjecutivo={Boolean(ejecutivos)} />
              ))}
            </section>
          ) : (
            <ListaClientes clientes={clientes} verEjecutivo={Boolean(ejecutivos)} />
          )}

          {total > clientes.length && (
            <p className="text-xs text-muted-foreground">
              Mostrando {formatNumero(clientes.length)} de {formatNumero(total)} clientes (límite {limite}). Usa la
              búsqueda para acotar.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Un cliente como tarjeta grande, con el estilo de Aseguradoras en su propio color: avatar, sus
 * pólizas en vigor y la prima, las aseguradoras con las que tiene póliza, cuánto de su cartera
 * está en vigor, el próximo vencimiento y contacto directo. Toda la tarjeta abre el expediente;
 * los botones de contacto quedan por encima del enlace.
 */
function TarjetaCliente({ c, hoy, orden, verEjecutivo }: { c: ClienteListado; hoy: string; orden: number; verEjecutivo: boolean }) {
  const color = colorDeNombre(c.nombre);
  const vigentes = c.polizas.length;
  const prima = c.polizas.reduce((s, p) => s + Number(p.prima_total), 0);
  const aseguradoras = [...new Map(c.polizas.map((p) => [p.aseguradora.nombre, p.aseguradora])).values()];
  const proxima = c.polizas[0]?.vigencia_fin;
  const dias = proxima ? diasDesdeHoy(proxima, hoy) : null;
  const wa = c.telefono ? numeroWhatsApp(c.telefono) : null;
  const retraso = Math.min(orden, 12) * 45;

  return (
    <div className="h-full animate-entrar" style={{ animationDelay: `${retraso}ms` }}>
      <Inclinable className="group/tarjeta h-full rounded-xl" grados={4}>
        <Card acento={color} className="h-full gap-4 px-5 py-5 transition-[border-color,box-shadow] duration-200 group-hover/tarjeta:shadow-lg">
          <Link
            href={`/clientes/${c.id}`}
            aria-label={`Ver expediente de ${c.nombre}`}
            className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <div className="flex items-start gap-3">
            <AvatarIniciales
              nombre={c.nombre}
              className="size-12 text-sm transition-[scale,rotate] duration-200 ease-out group-hover/tarjeta:scale-110 group-hover/tarjeta:-rotate-6 motion-reduce:group-hover/tarjeta:scale-100 motion-reduce:group-hover/tarjeta:rotate-0"
            />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 font-semibold wrap-anywhere" title={c.nombre}>
                {c.nombre}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {c.tipoPersona === "MORAL" ? "Persona moral" : "Persona física"}
                {c.rfc && (
                  <>
                    {" · "}
                    <span className="font-mono">{c.rfc}</span>
                  </>
                )}
              </p>
            </div>
            <ArrowUpRight
              aria-hidden
              className="size-4 shrink-0 text-primary opacity-0 transition-[opacity,translate] duration-200 ease-out group-hover/tarjeta:translate-x-0.5 group-hover/tarjeta:-translate-y-0.5 group-hover/tarjeta:opacity-100"
            />
          </div>

          <dl className="grid grid-cols-2 gap-3 border-t pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">Pólizas en vigor</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                <NumeroAnimado valor={formatNumero(vigentes)} />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Prima en vigor</dt>
              <dd className="truncate pt-1.5 text-sm font-medium tabular-nums">{formatMoneda(prima)}</dd>
            </div>
          </dl>

          <BarraProporcion
            etiqueta="De su cartera, en vigor"
            valor={`${formatNumero(vigentes)} de ${formatNumero(c._count.polizas)}`}
            fraccion={c._count.polizas > 0 ? vigentes / c._count.polizas : 0}
            color={color}
            retraso={400 + retraso}
          />

          {aseguradoras.length > 0 && (
            <ul aria-label="Aseguradoras" className="flex flex-wrap gap-1.5">
              {aseguradoras.slice(0, 3).map((a) => (
                <li key={a.nombre}>
                  <Badge variant="outline" className="max-w-36 gap-1.5 font-normal text-muted-foreground">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color_hex || "#71717a" }} />
                    <span className="truncate">{a.nombre}</span>
                  </Badge>
                </li>
              ))}
              {aseguradoras.length > 3 && (
                <li>
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    +{aseguradoras.length - 3}
                  </Badge>
                </li>
              )}
            </ul>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
            {dias !== null && proxima ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[11px]",
                  dias <= DIAS_AVISO_VENCIMIENTO ? "font-medium text-warning" : "text-muted-foreground"
                )}
              >
                <CalendarClock className="size-3.5" />
                {dias <= DIAS_AVISO_VENCIMIENTO
                  ? dias === 0
                    ? "Vence hoy"
                    : `Vence en ${dias} d`
                  : `Próximo vencimiento: ${formatFecha(proxima)}`}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">Sin pólizas en vigor</span>
            )}
            {/* Contacto directo: por encima del enlace de la tarjeta. */}
            <div className="relative z-10 ml-auto flex items-center gap-0.5">
              {c.telefono && (
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} aria-label={`Llamar a ${c.nombre}`} title={c.telefono}>
                    <Phone className="size-3.5" />
                  </a>
                </Button>
              )}
              {wa && (
                <Button asChild variant="ghost" size="icon" className="size-7 hover:text-success">
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp a ${c.nombre}`}
                    title="WhatsApp"
                  >
                    <MessageCircle className="size-3.5" />
                  </a>
                </Button>
              )}
              {c.email && (
                <Button asChild variant="ghost" size="icon" className="size-7">
                  <a href={`mailto:${c.email}`} aria-label={`Correo a ${c.nombre}`} title={c.email}>
                    <Mail className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
          {verEjecutivo && (
            <p className="-mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <UserRound className="size-3 shrink-0" />
              {c.ejecutivo?.nombre ?? "Sin ejecutivo asignado"}
            </p>
          )}
        </Card>
      </Inclinable>
    </div>
  );
}

/** Vista de lista: una tabla compacta para recorrer muchos clientes. */
function ListaClientes({ clientes, verEjecutivo }: { clientes: ClienteListado[]; verEjecutivo: boolean }) {
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-5">Nombre</TableHead>
            <TableHead>RFC</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Correo</TableHead>
            {verEjecutivo && <TableHead>Ejecutivo</TableHead>}
            <TableHead className="pr-5 text-right">Pólizas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="max-w-[320px] pl-5">
                <div className="flex items-center gap-3">
                  <AvatarIniciales nombre={c.nombre} />
                  <div className="min-w-0">
                    <Link href={`/clientes/${c.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                      {c.nombre}
                    </Link>
                    {c.tipoPersona === "MORAL" && <span className="text-[11px] text-muted-foreground">Persona moral</span>}
                  </div>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">{c.rfc || <SinDato />}</TableCell>
              <TableCell>
                {c.telefono ? (
                  <a
                    href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary hover:underline"
                  >
                    <Phone className="size-3 text-muted-foreground" />
                    {c.telefono}
                  </a>
                ) : (
                  <SinDato />
                )}
              </TableCell>
              <TableCell className="max-w-[240px]">
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="inline-flex max-w-full items-center gap-1.5 hover:text-primary hover:underline">
                    <Mail className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.email}</span>
                  </a>
                ) : (
                  <SinDato />
                )}
              </TableCell>
              {verEjecutivo && (
                <TableCell className="max-w-[160px] truncate text-sm">
                  {c.ejecutivo?.nombre ?? <span className="text-xs text-muted-foreground">Sin asignar</span>}
                </TableCell>
              )}
              <TableCell className="pr-5 text-right">
                {c._count.polizas > 0 ? (
                  <Link href={`/clientes/${c.id}`} aria-label={`Ver expediente y pólizas de ${c.nombre}`}>
                    <Badge variant="secondary" className="tabular-nums hover:bg-primary/15">
                      {formatNumero(c._count.polizas)}
                    </Badge>
                  </Link>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground tabular-nums">
                    0
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
