"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FlaskConical,
  Loader2,
  PencilLine,
  Search,
  Send,
  Users,
  XCircle,
} from "lucide-react";

import { EditorCorreo } from "@/components/comunicaciones/editor-correo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  construirCorreoHtml,
  cuerpoVacio,
  MAX_ASUNTO,
  MAX_BYTES_CUERPO,
  MAX_DESTINATARIOS,
  personalizar,
  type DestinatarioCorreo,
  type EnviarCorreoRespuesta,
  type EnviarCorreoSolicitud,
  type MarcaCorreo,
} from "@/lib/comunicaciones/correo";
import { cn } from "@/lib/utils";

const CUERPO_INICIAL = `<p>Estimado(a) {{nombre}}:</p><p></p><p>Saludos cordiales.</p>`;

type Modo = "todos" | "seleccion";
type Envio = { tipo: "prueba" | "real"; respuesta: EnviarCorreoRespuesta };

export function RedactorCorreo({
  clientes,
  sinCorreo,
  remitente,
  marca,
}: {
  clientes: DestinatarioCorreo[];
  /** Clientes sin correo capturado (no aparecen en la lista). */
  sinCorreo: number;
  /** EMAIL_SENDER; null si el envío no está configurado. */
  remitente: string | null;
  marca: MarcaCorreo;
}) {
  const [asunto, setAsunto] = React.useState("");
  const [html, setHtml] = React.useState(CUERPO_INICIAL);
  const [modo, setModo] = React.useState<Modo>("seleccion");
  const [seleccion, setSeleccion] = React.useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = React.useState(false);
  const [enviando, setEnviando] = React.useState<"prueba" | "real" | null>(null);
  const [envio, setEnvio] = React.useState<Envio | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const total = modo === "todos" ? clientes.length : seleccion.size;
  const primero = modo === "todos" ? clientes[0] : clientes.find((c) => seleccion.has(c.id));
  const faltaContenido = !asunto.trim() ? "Escribe el asunto." : cuerpoVacio(html) ? "Escribe el cuerpo del correo." : null;
  const excedeLimite = total > MAX_DESTINATARIOS;

  async function enviar(tipo: "prueba" | "real") {
    setAviso(null);
    setEnviando(tipo);
    const solicitud: EnviarCorreoSolicitud = {
      asunto: asunto.trim(),
      html,
      destinatarios: modo === "todos" ? "todos" : [...seleccion],
      prueba: tipo === "prueba",
    };
    try {
      const cuerpo = JSON.stringify(solicitud);
      if (cuerpo.length > MAX_BYTES_CUERPO) {
        setAviso("El correo es demasiado grande. Reduce el tamaño o la cantidad de imágenes.");
        return;
      }
      const res = await fetch("/api/comunicaciones/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: cuerpo,
      });
      const respuesta = (await res.json().catch(() => ({
        ok: false,
        error: `Error del servidor (${res.status}).`,
      }))) as EnviarCorreoRespuesta;
      setEnvio({ tipo, respuesta });
    } catch {
      setEnvio({ tipo, respuesta: { ok: false, error: "No se pudo contactar al servidor." } });
    } finally {
      setEnviando(null);
      setConfirmar(false);
    }
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,2fr)]">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Redactar correo</CardTitle>
          <CardDescription>
            Da formato al texto e inserta imágenes o logos. Usa{" "}
            <code className="rounded bg-muted px-1 font-mono text-xs text-primary">{"{{nombre}}"}</code> para
            personalizar cada correo con el nombre del cliente.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="correo-asunto" className="text-xs">
              Asunto
            </Label>
            <Input
              id="correo-asunto"
              value={asunto}
              maxLength={MAX_ASUNTO}
              placeholder="Ej. Renovación de tu póliza de gastos médicos"
              onChange={(e) => setAsunto(e.target.value)}
            />
          </div>

          <Tabs defaultValue="editar" className="gap-3">
            <TabsList>
              <TabsTrigger value="editar">
                <PencilLine /> Editar
              </TabsTrigger>
              <TabsTrigger value="vista">
                <Eye /> Vista previa
              </TabsTrigger>
            </TabsList>
            {/* forceMount conserva el editor (y su historial) al cambiar de pestaña. */}
            <TabsContent value="editar" forceMount className="data-[state=inactive]:hidden">
              <EditorCorreo contenidoInicial={CUERPO_INICIAL} onChange={setHtml} onError={setAviso} />
            </TabsContent>
            <TabsContent value="vista">
              <VistaPrevia
                asunto={asunto}
                html={html}
                marca={marca}
                remitente={remitente}
                destinatario={primero}
              />
            </TabsContent>
          </Tabs>

          {aviso && (
            <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {aviso}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <SelectorDestinatarios
          clientes={clientes}
          sinCorreo={sinCorreo}
          modo={modo}
          onModo={setModo}
          seleccion={seleccion}
          onSeleccion={setSeleccion}
        >
          {!remitente && (
            <Alert className="border-warning/30 bg-warning/10 text-warning">
              <AlertTriangle />
              <AlertTitle>Envío no configurado</AlertTitle>
              <AlertDescription className="text-warning/90">
                Agrega RESEND_API_KEY y EMAIL_SENDER a las variables de entorno para poder enviar.
              </AlertDescription>
            </Alert>
          )}
          {excedeLimite && (
            <p className="text-xs text-warning">
              El máximo por envío es {MAX_DESTINATARIOS} destinatarios. Divide el envío en grupos.
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button
              disabled={!remitente || !!faltaContenido || total === 0 || excedeLimite || enviando !== null}
              onClick={() => setConfirmar(true)}
              title={faltaContenido ?? undefined}
            >
              <Send /> Enviar a {total} {total === 1 ? "cliente" : "clientes"}
            </Button>
            <Button
              variant="outline"
              disabled={!remitente || !!faltaContenido || enviando !== null}
              onClick={() => enviar("prueba")}
              title="Envía el correo solo a tu dirección para revisarlo"
            >
              {enviando === "prueba" ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              Enviarme una prueba
            </Button>
            {faltaContenido && <p className="text-center text-xs text-muted-foreground">{faltaContenido}</p>}
          </div>
        </SelectorDestinatarios>

        {envio && <ResultadoEnvio envio={envio} onCerrar={() => setEnvio(null)} />}
      </div>

      <Dialog open={confirmar} onOpenChange={(abierto) => enviando === null && setConfirmar(abierto)}>
        <DialogContent showCloseButton={enviando === null}>
          <DialogHeader>
            <DialogTitle>¿Enviar el correo?</DialogTitle>
            <DialogDescription>
              Se enviará «{asunto.trim()}» a {total} {total === 1 ? "cliente" : "clientes"}
              {modo === "todos" ? " (todos los clientes con correo)" : ""}. Cada cliente recibe un correo
              individual. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {enviando === "real" && total > 20 && (
            <p className="text-xs text-muted-foreground">
              Enviando… puede tardar alrededor de {Math.ceil((total * 0.6) / 60)} min. No cierres esta página.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={enviando !== null} onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
            <Button disabled={enviando !== null} onClick={() => enviar("real")}>
              {enviando === "real" ? <Loader2 className="animate-spin" /> : <Send />}
              {enviando === "real" ? "Enviando…" : "Enviar ahora"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelectorDestinatarios({
  clientes,
  sinCorreo,
  modo,
  onModo,
  seleccion,
  onSeleccion,
  children,
}: {
  clientes: DestinatarioCorreo[];
  sinCorreo: number;
  modo: Modo;
  onModo: (modo: Modo) => void;
  seleccion: Set<string>;
  onSeleccion: (seleccion: Set<string>) => void;
  children: React.ReactNode;
}) {
  const [busqueda, setBusqueda] = React.useState("");
  const texto = busqueda.trim().toLowerCase();
  const visibles = texto
    ? clientes.filter((c) => c.nombre.toLowerCase().includes(texto) || c.email.toLowerCase().includes(texto))
    : clientes;
  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((c) => seleccion.has(c.id));

  function alternar(id: string) {
    const siguiente = new Set(seleccion);
    if (siguiente.has(id)) siguiente.delete(id);
    else siguiente.add(id);
    onSeleccion(siguiente);
  }

  function alternarVisibles() {
    const siguiente = new Set(seleccion);
    for (const c of visibles) {
      if (todosVisiblesMarcados) siguiente.delete(c.id);
      else siguiente.add(c.id);
    }
    onSeleccion(siguiente);
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-primary" /> Destinatarios
        </CardTitle>
        <CardDescription>
          {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"} con correo
          {sinCorreo > 0 && ` · ${sinCorreo} sin correo registrado`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 px-5 py-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Destinatarios">
          {(
            [
              ["seleccion", "Elegir clientes"],
              ["todos", "Todos"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={modo === valor}
              onClick={() => onModo(valor)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                modo === valor && "bg-background text-foreground shadow-sm"
              )}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {modo === "todos" ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Se enviará a los <span className="font-medium text-foreground">{clientes.length}</span> clientes con
            correo registrado.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o correo"
                className="pl-8"
                aria-label="Buscar clientes"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{seleccion.size} seleccionados</span>
              <div className="flex gap-3">
                <button type="button" className="hover:text-foreground" onClick={alternarVisibles} disabled={visibles.length === 0}>
                  {todosVisiblesMarcados ? "Quitar visibles" : "Marcar visibles"}
                </button>
                {seleccion.size > 0 && (
                  <button type="button" className="hover:text-foreground" onClick={() => onSeleccion(new Set())}>
                    Limpiar
                  </button>
                )}
              </div>
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
              {visibles.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {clientes.length === 0 ? "No hay clientes con correo registrado." : "Sin resultados."}
                </li>
              ) : (
                visibles.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={seleccion.has(c.id)}
                        onChange={() => alternar(c.id)}
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{c.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                      </span>
                    </label>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t px-5 py-4 [.border-t]:pt-4">{children}</CardFooter>
    </Card>
  );
}

function VistaPrevia({
  asunto,
  html,
  marca,
  remitente,
  destinatario,
}: {
  asunto: string;
  html: string;
  marca: MarcaCorreo;
  remitente: string | null;
  destinatario?: DestinatarioCorreo;
}) {
  const nombre = destinatario?.nombre ?? "Cliente de ejemplo";
  const asuntoFinal = personalizar(asunto, nombre, false);
  const documento = construirCorreoHtml({ asunto: asuntoFinal, cuerpo: personalizar(html, nombre, true), marca });

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <dl className="divide-y border-b text-sm">
        <div className="flex gap-3 px-4 py-2.5">
          <dt className="w-14 shrink-0 text-muted-foreground">De</dt>
          <dd className="truncate">{remitente ?? "(EMAIL_SENDER sin configurar)"}</dd>
        </div>
        <div className="flex gap-3 px-4 py-2.5">
          <dt className="w-14 shrink-0 text-muted-foreground">Para</dt>
          <dd className="truncate">
            {nombre}
            {destinatario && <span className="text-muted-foreground"> &lt;{destinatario.email}&gt;</span>}
          </dd>
        </div>
        <div className="flex gap-3 px-4 py-2.5">
          <dt className="w-14 shrink-0 text-muted-foreground">Asunto</dt>
          <dd className="font-medium">{asuntoFinal || <span className="text-muted-foreground">(sin asunto)</span>}</dd>
        </div>
      </dl>
      {/* sandbox sin scripts: el HTML se muestra tal como lo verá el cliente. */}
      <iframe title="Vista previa del correo" srcDoc={documento} sandbox="" className="h-[560px] w-full bg-[#f4f4f5]" />
    </div>
  );
}

function ResultadoEnvio({ envio, onCerrar }: { envio: Envio; onCerrar: () => void }) {
  const { respuesta, tipo } = envio;

  if (!respuesta.ok) {
    return (
      <Alert variant="destructive">
        <XCircle />
        <AlertTitle>No se envió el correo</AlertTitle>
        <AlertDescription>{respuesta.error}</AlertDescription>
      </Alert>
    );
  }

  const fallidos = respuesta.resultados.filter((r) => !r.ok);
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          {respuesta.fallidos === 0 ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : (
            <AlertTriangle className="size-4 text-warning" />
          )}
          {tipo === "prueba" ? "Prueba enviada" : "Envío terminado"}
        </CardTitle>
        <CardDescription>
          {tipo === "prueba"
            ? `Revisa la bandeja de ${respuesta.resultados[0]?.email ?? "tu correo"}.`
            : `${respuesta.enviados} enviados · ${respuesta.fallidos} con error` +
              (respuesta.omitidos > 0 ? ` · ${respuesta.omitidos} omitidos (correo inválido o repetido)` : "")}
        </CardDescription>
      </CardHeader>
      {fallidos.length > 0 && (
        <CardContent className="px-5 py-3">
          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
            {fallidos.map((r) => (
              <li key={r.email}>
                <span className="font-medium">{r.nombre}</span>{" "}
                <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
                <span className="block text-destructive">{r.error}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      <CardFooter className="justify-end border-t px-5 py-2 [.border-t]:pt-2">
        <Button variant="ghost" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </CardFooter>
    </Card>
  );
}
