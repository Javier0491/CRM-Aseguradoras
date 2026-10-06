import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getAgencia } from "@/lib/agencias/queries";
import { esAdmin, requireUser } from "@/lib/auth/dal";
import { getClienteExpediente, getPosiblesDuplicados } from "@/lib/clientes/queries";
import { diasParaCumpleanos, fechaNacimientoCliente, TIPOS_PERSONA } from "@/lib/clientes/reglas";
import { formatFecha, formatMoneda, formatNumero, hoyISO } from "@/lib/format";
import { edadAl } from "@/lib/polizas/asegurados";
import { DIAS_POR_VENCER } from "@/lib/polizas/queries";
import { getTareasDe } from "@/lib/tareas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Expediente del cliente",
};

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || nombre.slice(0, 2).toUpperCase();

const iso = (d: Date) => d.toISOString().slice(0, 10);

function DatoContacto({
  icono: Icon,
  etiqueta,
  children,
  className,
}: {
  icono: typeof Phone;
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-3 rounded-lg border bg-background/60 px-3 py-2.5", className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <div className="truncate text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

export default async function ClienteExpedientePage({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const cliente = await getClienteExpediente(id);
  if (!cliente) notFound();
  const user = await requireUser();
  const admin = esAdmin(user);
  const hoy = hoyISO();
  const [tareas, ejecutivos, duplicados, agencia] = await Promise.all([
    getTareasDe({ clienteId: cliente.id }),
    user.soloSuCartera ? Promise.resolve(undefined) : getEjecutivos(user.agenciaId),
    admin ? getPosiblesDuplicados(cliente) : Promise.resolve([]),
    getAgencia(user.agenciaId),
  ]);

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

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-4 border-b border-primary/15 bg-primary/[0.04] px-5 py-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground">
            {iniciales(cliente.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{cliente.nombre}</h1>
            <p className="text-sm text-muted-foreground">
              {formatNumero(cliente.polizas.length)} {cliente.polizas.length === 1 ? "póliza" : "pólizas"} ·{" "}
              {conteo.vigente} {conteo.vigente === 1 ? "vigente" : "vigentes"}
              {conteo.por_vencer > 0 && ` · ${conteo.por_vencer} por vencer`}
              {conteo.vencida > 0 && ` · ${conteo.vencida} ${conteo.vencida === 1 ? "vencida" : "vencidas"}`}
              {conteo.cancelada > 0 && ` · ${conteo.cancelada} ${conteo.cancelada === 1 ? "cancelada" : "canceladas"}`}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline">{TIPOS_PERSONA.find((t) => t.value === cliente.tipoPersona)?.label}</Badge>
              <Badge variant="outline" className="gap-1">
                <UserRound className="size-3" /> {cliente.ejecutivo?.nombre ?? "Sin ejecutivo"}
              </Badge>
              {diasCumple !== null && diasCumple <= 7 && cliente.tipoPersona === "FISICA" && (
                <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                  <Cake className="size-3" /> {diasCumple === 0 ? "¡Cumple años hoy!" : `Cumple en ${diasCumple} d`}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 text-right">
              <p className="text-xs text-muted-foreground">Prima en vigor</p>
              <p className="text-lg font-semibold text-primary tabular-nums">{formatMoneda(primaVigente)}</p>
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
          <DatoContacto icono={Phone} etiqueta="Teléfono">
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
          <DatoContacto icono={Mail} etiqueta="Correo">
            {cliente.email ? (
              <a href={`mailto:${cliente.email}`} className="hover:text-primary hover:underline">
                {cliente.email}
              </a>
            ) : (
              <span className="text-muted-foreground">Sin correo</span>
            )}
          </DatoContacto>
          <DatoContacto icono={Fingerprint} etiqueta="RFC">
            <span className="font-mono">{cliente.rfc || "—"}</span>
          </DatoContacto>
          <DatoContacto icono={Cake} etiqueta={cliente.tipoPersona === "MORAL" ? "Constitución" : "Nacimiento"}>
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
          <DatoContacto icono={MapPin} etiqueta="Dirección" className="sm:col-span-2">
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
                        <TableCell className="pl-5">
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
                        <TableCell>
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
              usuarioId={user.id}
              puedeBorrarTodo={admin}
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
                  ejecutivos={ejecutivos}
                  usuarioId={user.id}
                  sugerencia={`Llamar a ${cliente.nombre}`}
                  etiqueta="Agregar"
                  variante="ghost"
                  className="h-7"
                />
              </CardAction>
            </CardHeader>
            <ListaTareas tareas={tareas} hoy={hoy} contexto="cliente" vacio="Sin tareas de este cliente." />
          </Card>

          {admin && duplicados.length > 0 && (
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
        mensaje={`Hola ${cliente.nombre}, le escribimos de ${agencia.nombre}.`}
      />
    </>
  );
}
