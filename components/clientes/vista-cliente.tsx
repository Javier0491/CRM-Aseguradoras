import Link from "next/link";
import {
  ArrowLeft,
  Cake,
  Combine,
  FilePlus2,
  FileText,
  Fingerprint,
  ListTodo,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  UserRound,
} from "lucide-react";

import { DuplicadosCliente } from "@/components/clientes/duplicados-cliente";
import { EditarCliente } from "@/components/clientes/editar-cliente";
import { SeguimientoCliente } from "@/components/clientes/seguimiento-cliente";
import { NumeroAnimado } from "@/components/dashboard/numero-animado";
import { AvatarIniciales } from "@/components/layout/avatar-iniciales";
import { BarraAccionesMovil, numeroWhatsApp } from "@/components/layout/barra-acciones-movil";
import {
  AseguradoraTag,
  EstadoVigenciaBadge,
  esCobrado,
  estadoVigencia,
  formaPagoLabel,
  RamoBadge,
} from "@/components/polizas/poliza-ui";
import { ListaTareas } from "@/components/tareas/lista-tareas";
import { NuevaTarea } from "@/components/tareas/nueva-tarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { getClienteExpediente, getPosiblesDuplicados } from "@/lib/clientes/queries";
import { diasParaCumpleanos, fechaNacimientoCliente, TIPOS_PERSONA } from "@/lib/clientes/reglas";
import { formatFecha, formatMoneda, formatNumero } from "@/lib/format";
import { edadAl } from "@/lib/polizas/asegurados";
import { DIAS_POR_VENCER } from "@/lib/polizas/queries";
import type { getTareasDe } from "@/lib/tareas/queries";
import type { OpcionEjecutivo, OpcionEquipo } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);

type ConteoEstados = { vigente: number; por_vencer: number; vencida: number; cancelada: number };

const SEGMENTOS_SALUD: { clave: keyof ConteoEstados; etiqueta: string; color: string }[] = [
  { clave: "vigente", etiqueta: "vigentes", color: "bg-success" },
  { clave: "por_vencer", etiqueta: "por vencer", color: "bg-warning" },
  { clave: "vencida", etiqueta: "vencidas", color: "bg-destructive" },
  { clave: "cancelada", etiqueta: "canceladas", color: "bg-muted-foreground/50" },
];

/** La cartera del cliente de un vistazo: una barra con la proporción de pólizas en cada estado. */
function SaludCartera({ conteo }: { conteo: ConteoEstados }) {
  const total = conteo.vigente + conteo.por_vencer + conteo.vencida + conteo.cancelada;
  const segmentos = SEGMENTOS_SALUD.filter((s) => conteo[s.clave] > 0);
  return (
    <div
      role="img"
      aria-label={segmentos.map((s) => `${conteo[s.clave]} ${s.etiqueta}`).join(", ")}
      className="mt-3 flex h-1.5 max-w-sm animate-barra gap-0.5 overflow-hidden rounded-full"
      style={{ animationDelay: "350ms" }}
    >
      {segmentos.map((s) => (
        <span key={s.clave} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.color)} style={{ flexGrow: conteo[s.clave] / total }} />
      ))}
    </div>
  );
}

function DatoContacto({
  icono: Icon,
  etiqueta,
  children,
  className,
  orden = 0,
}: {
  icono: typeof Phone;
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
  /** Posición, para escalonar la entrada. */
  orden?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${150 + orden * 50}ms` }}
      className={cn(
        "group/dato flex min-w-0 animate-entrar items-start gap-3 rounded-lg border bg-background/60 px-3 py-2.5 transition-[border-color,translate,box-shadow] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md motion-reduce:hover:translate-y-0",
        className
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary transition-[scale,rotate] duration-200 ease-out group-hover/dato:scale-110 group-hover/dato:-rotate-6 motion-reduce:group-hover/dato:scale-100 motion-reduce:group-hover/dato:rotate-0">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <div className="text-sm font-medium wrap-anywhere">{children}</div>
      </div>
    </div>
  );
}

export type DatosCliente = {
  cliente: NonNullable<Awaited<ReturnType<typeof getClienteExpediente>>>;
  tareas: Awaited<ReturnType<typeof getTareasDe>>;
  /** Para asignar tareas y el ejecutivo del cliente; no viene para quien solo ve su cartera. */
  ejecutivos?: OpcionEjecutivo[];
  /** Todo el equipo, para encargarle tareas; no viene para quien solo ve su cartera. */
  equipo?: OpcionEquipo[];
  /** Posibles duplicados (solo los ve un administrador). */
  duplicados: Awaited<ReturnType<typeof getPosiblesDuplicados>>;
  /** Nombre de la agencia, para los mensajes al cliente. */
  agencia: string;
  usuario: { id: string; email: string | null; admin: boolean; coordinaTareas: boolean };
  hoy: string;
};

/** Expediente del cliente: contacto, pólizas, seguimiento, tareas y duplicados. La página carga los datos. */
export function VistaCliente({ cliente, tareas, ejecutivos, equipo, duplicados, agencia, usuario, hoy }: DatosCliente) {
  const estados = cliente.polizas.map((p) => estadoVigencia(p.vigencia_fin, hoy, DIAS_POR_VENCER, p.canceladaAt));
  const conteo = {
    vigente: estados.filter((e) => e === "vigente").length,
    por_vencer: estados.filter((e) => e === "por_vencer").length,
    vencida: estados.filter((e) => e === "vencida").length,
    cancelada: estados.filter((e) => e === "cancelada").length,
  };
  // Prima de la cartera en vigor (vigentes y por vencer).
  const primaVigente = cliente.polizas
    .filter((_, i) => estados[i] === "vigente" || estados[i] === "por_vencer")
    .reduce((s, p) => s + Number(p.prima_total), 0);
  const wa = cliente.telefono ? numeroWhatsApp(cliente.telefono) : null;
  const nacimiento = fechaNacimientoCliente(
    {
      fechaNacimiento: cliente.fechaNacimiento ? iso(cliente.fechaNacimiento) : null,
      rfc: cliente.rfc,
      tipoPersona: cliente.tipoPersona,
    },
    hoy
  );
  const diasCumple = nacimiento ? diasParaCumpleanos(nacimiento.fecha, hoy) : null;
  const direccion = [cliente.direccion, cliente.municipio, cliente.estado, cliente.codigoPostal && `C.P. ${cliente.codigoPostal}`]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
        <Link href="/clientes">
          <ArrowLeft /> Directorio de clientes
        </Link>
      </Button>

      <Card className="animate-entrar gap-0 overflow-hidden py-0">
        <div className="relative flex flex-wrap items-center gap-5 border-b border-primary/15 bg-[radial-gradient(90%_140%_at_0%_0%,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent_60%)] px-5 py-6">
          {/* Avatar con aro de la marca y un halo suave detrás. */}
          <div className="relative shrink-0">
            <span aria-hidden className="absolute -inset-3 rounded-full bg-primary/20 blur-xl" />
            <span aria-hidden className="absolute -inset-1 rounded-full bg-[conic-gradient(from_200deg,var(--color-primary),transparent_40%,var(--color-primary)_75%,transparent)] opacity-80" />
            <AvatarIniciales nombre={cliente.nombre} className="relative size-16 text-lg ring-4 ring-card" />
          </div>
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="encabezado-titulo text-2xl font-semibold tracking-tight text-balance wrap-anywhere">
              {cliente.nombre}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatNumero(cliente.polizas.length)} {cliente.polizas.length === 1 ? "póliza" : "pólizas"} ·{" "}
              {conteo.vigente} {conteo.vigente === 1 ? "vigente" : "vigentes"}
              {conteo.por_vencer > 0 && ` · ${conteo.por_vencer} por vencer`}
              {conteo.vencida > 0 && ` · ${conteo.vencida} ${conteo.vencida === 1 ? "vencida" : "vencidas"}`}
              {conteo.cancelada > 0 && ` · ${conteo.cancelada} ${conteo.cancelada === 1 ? "cancelada" : "canceladas"}`}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline">{TIPOS_PERSONA.find((t) => t.value === cliente.tipoPersona)?.label}</Badge>
              <Badge variant="outline" className="max-w-full gap-1" title={cliente.ejecutivo?.nombre}>
                <UserRound className="size-3" />
                <span className="truncate">{cliente.ejecutivo?.nombre ?? "Sin ejecutivo"}</span>
              </Badge>
              {diasCumple !== null && diasCumple <= 7 && cliente.tipoPersona === "FISICA" && (
                <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                  <Cake className="size-3" /> {diasCumple === 0 ? "¡Cumple años hoy!" : `Cumple en ${diasCumple} d`}
                </Badge>
              )}
            </div>
            {cliente.polizas.length > 0 && <SaludCartera conteo={conteo} />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 text-right">
              <p className="text-xs text-muted-foreground">Prima en vigor</p>
              <p className="text-2xl font-semibold text-primary tabular-nums drop-shadow-[0_0_14px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]">
                <NumeroAnimado valor={formatMoneda(primaVigente)} />
              </p>
            </div>
            <EditarCliente
              ejecutivos={ejecutivos}
              cliente={{
                id: cliente.id,
                nombre: cliente.nombre,
                rfc: cliente.rfc,
                telefono: cliente.telefono,
                email: cliente.email,
                tipoPersona: cliente.tipoPersona,
                fechaNacimiento: cliente.fechaNacimiento ? iso(cliente.fechaNacimiento) : "",
                direccion: cliente.direccion ?? "",
                municipio: cliente.municipio ?? "",
                estado: cliente.estado ?? "",
                codigoPostal: cliente.codigoPostal ?? "",
                ejecutivoId: cliente.ejecutivoId,
              }}
            />
          </div>
        </div>
        <CardContent className="grid gap-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
          <DatoContacto icono={Phone} etiqueta="Teléfono" orden={0}>
            {cliente.telefono ? (
              <span className="flex items-center gap-2">
                <a href={`tel:${cliente.telefono}`} className="tabular-nums hover:text-primary hover:underline">
                  {cliente.telefono}
                </a>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-success"
                    aria-label={`WhatsApp a ${cliente.nombre}`}
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle className="size-3.5" />
                  </a>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin teléfono</span>
            )}
          </DatoContacto>
          <DatoContacto icono={Mail} etiqueta="Correo" orden={1}>
            {cliente.email ? (
              <a href={`mailto:${cliente.email}`} className="hover:text-primary hover:underline">
                {cliente.email}
              </a>
            ) : (
              <span className="text-muted-foreground">Sin correo</span>
            )}
          </DatoContacto>
          <DatoContacto icono={Fingerprint} etiqueta="RFC" orden={2}>
            <span className="font-mono">{cliente.rfc || "—"}</span>
          </DatoContacto>
          <DatoContacto icono={Cake} etiqueta={cliente.tipoPersona === "MORAL" ? "Constitución" : "Nacimiento"} orden={3}>
            {nacimiento ? (
              <span>
                {formatFecha(`${nacimiento.fecha}T00:00:00Z`)}
                {cliente.tipoPersona === "FISICA" && (
                  <span className="text-muted-foreground"> · {edadAl(nacimiento.fecha, hoy)} años</span>
                )}
                {nacimiento.origen === "rfc" && <span className="text-xs text-muted-foreground"> (del RFC)</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">Sin capturar</span>
            )}
          </DatoContacto>
          <DatoContacto icono={MapPin} etiqueta="Dirección" orden={4} className="sm:col-span-2">
            {direccion ? (
              <span className="whitespace-normal">{direccion}</span>
            ) : (
              <span className="text-muted-foreground">Sin dirección · agrégala en Editar</span>
            )}
          </DatoContacto>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-primary" /> Pólizas del cliente
              </CardTitle>
              <CardDescription>Todas sus pólizas registradas, de la vigencia más reciente a la más antigua.</CardDescription>
              <CardAction>
                <Button asChild variant="ghost" size="sm" className="h-7">
                  <Link href="/captura">
                    <FilePlus2 /> Capturar
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            {cliente.polizas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                <p className="text-sm font-medium">Este cliente no tiene pólizas registradas</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Las pólizas se asocian a su RFC al capturarlas.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Póliza</TableHead>
                    <TableHead>Aseguradora</TableHead>
                    <TableHead>Ramo</TableHead>
                    <TableHead>Vigencia</TableHead>
                    <TableHead className="text-right">Prima</TableHead>
                    <TableHead className="text-right">Recibos</TableHead>
                    <TableHead className="pr-5">Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cliente.polizas.map((p, i) => {
                    const cobrados = p.recibos.filter((r) => esCobrado(r.estado)).length;
                    const cobrables = p.recibos.filter((r) => r.estado !== "CANCELADO").length;
                    return (
                      <TableRow
                        key={p.id}
                        className={cn((estados[i] === "vencida" || estados[i] === "cancelada") && "text-muted-foreground")}
                      >
                        <TableCell className="max-w-56 min-w-36 pl-5 whitespace-normal wrap-anywhere">
                          <Link
                            href={`/polizas/${p.id}`}
                            className="font-mono text-sm font-medium hover:text-primary hover:underline"
                          >
                            {p.numeroImpreso}
                          </Link>
                          {p.polizaVigor && p.polizaVigor !== p.numeroImpreso && (
                            <p className="font-mono text-[11px] text-muted-foreground">vigor {p.polizaVigor}</p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-52">
                          <AseguradoraTag nombre={p.aseguradora.nombre} color={p.aseguradora.color_hex} />
                        </TableCell>
                        <TableCell>
                          <RamoBadge ramo={p.ramo} />
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">
                          {formatFecha(p.vigencia_inicio)} – {formatFecha(p.vigencia_fin)}
                        </TableCell>
                        <TableCell className="text-right">
                          <p className="tabular-nums">{formatMoneda(Number(p.prima_total))}</p>
                          <p className="text-[11px] text-muted-foreground">{formaPagoLabel[p.forma_pago]}</p>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {cobrados}/{cobrables}
                        </TableCell>
                        <TableCell className="pr-5">
                          <EstadoVigenciaBadge
                            fin={p.vigencia_fin}
                            hoy={hoy}
                            diasAviso={DIAS_POR_VENCER}
                            cancelada={p.canceladaAt}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessagesSquare className="size-4 text-primary" /> Seguimiento
              </CardTitle>
              <CardDescription>Llamadas, mensajes, reuniones y acuerdos con el cliente.</CardDescription>
            </CardHeader>
            <SeguimientoCliente
              clienteId={cliente.id}
              registros={cliente.notas}
              polizas={cliente.polizas.map((p) => ({ id: p.id, numeroImpreso: p.numeroImpreso }))}
              usuarioId={usuario.id}
              puedeBorrarTodo={usuario.admin}
            />
          </Card>
        </div>

        <div className="min-w-0 space-y-6 xl:sticky xl:top-20">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="size-4 text-primary" /> Tareas
              </CardTitle>
              <CardAction>
                <NuevaTarea
                  hoy={hoy}
                  clienteId={cliente.id}
                  equipo={equipo}
                  usuarioId={usuario.id}
                  sugerencia={`Llamar a ${cliente.nombre}`}
                  etiqueta="Agregar"
                  variante="ghost"
                  className="h-7"
                />
              </CardAction>
            </CardHeader>
            <ListaTareas
              tareas={tareas}
              hoy={hoy}
              usuarioId={usuario.id}
              usuarioEmail={usuario.email}
              coordina={usuario.coordinaTareas}
              contexto="cliente"
              vacio="Sin tareas de este cliente."
            />
          </Card>

          {usuario.admin && duplicados.length > 0 && (
            <Card className="gap-0 border-warning/40 py-0">
              <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Combine className="size-4 text-warning" /> Posibles duplicados
                </CardTitle>
                <CardDescription>
                  Clientes con el mismo RFC (o casi) o el mismo nombre. Si son la misma persona, fusiónalos aquí.
                </CardDescription>
              </CardHeader>
              <DuplicadosCliente destino={{ id: cliente.id, nombre: cliente.nombre }} duplicados={duplicados} />
            </Card>
          )}
        </div>
      </div>

      <BarraAccionesMovil
        telefono={cliente.telefono}
        email={cliente.email}
        mensaje={`Hola ${cliente.nombre}, le escribimos de ${agencia}.`}
      />
    </>
  );
}
