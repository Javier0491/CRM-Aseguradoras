"use client";

import * as React from "react";
import { FileScan, Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { crearSolicitudCotizacion } from "@/lib/cotizador/actions";
import { aseguradorasDelRamo } from "@/lib/cotizador/aseguradoras";
import type { LecturaDocumentosAuto } from "@/lib/cotizador/lector";
import {
  ASEGURADORAS_COTIZADOR,
  COBERTURAS_PREDETERMINADAS,
  DEDUCIBLES_DM,
  DEDUCIBLES_RT,
  edadEn,
  ETIQUETA_FORMA_PAGO,
  ETIQUETA_PAQUETE,
  ETIQUETA_PROCEDENCIA,
  ETIQUETA_TIPO_VEHICULO,
  ETIQUETA_VALOR,
  EXTRAS,
  FORMAS_PAGO,
  PAQUETES,
  PROCEDENCIAS,
  TIPOS_VEHICULO,
  VALORES_VEHICULO,
  type Extra,
  type FormaPago,
  type Paquete,
  type Procedencia,
  type TipoPersona,
  type TipoVehiculo,
  type ValorVehiculo,
} from "@/lib/cotizador/reglas";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

const millones = (...m: number[]) => m.map((x) => x * 1_000_000);
const miles = (...m: number[]) => m.map((x) => x * 1_000);
const SUMAS = {
  responsabilidadCivil: millones(1, 1.5, 2, 2.5, 3, 4, 5, 6, 8),
  gastosMedicosOcupantes: miles(100, 200, 300, 400, 500, 600, 800, 1000),
  muerteConductor: miles(100, 150, 200, 300, 500, 1000),
  rcDanosOcupantes: miles(300, 500, 750, 1000, 1500, 2000),
  rcComplementariaPersonas: millones(1, 2, 3, 4, 5),
} as const;
type CampoSuma = keyof typeof SUMAS;
const ETIQUETA_SUMA: Record<CampoSuma, string> = {
  responsabilidadCivil: "Responsabilidad civil",
  gastosMedicosOcupantes: "Gastos médicos ocupantes",
  muerteConductor: "Muerte del conductor por accidente",
  rcDanosOcupantes: "RC daños a ocupantes",
  rcComplementariaPersonas: "RC complementaria personas",
};
/** Las del paquete básico y los extras con suma asegurada (estos se pueden dejar en "No contratar"). */
const BASICAS: readonly CampoSuma[] = ["responsabilidadCivil", "gastosMedicosOcupantes", "muerteConductor"];
const OPCIONALES: readonly CampoSuma[] = ["rcDanosOcupantes", "rcComplementariaPersonas"];
const NINGUNA = "ninguna";

/** Aseguradoras de Autos del catálogo: las que ya se cotizan primero. */
const ASEGURADORAS_AUTOS = aseguradorasDelRamo("AUTOS");
const SELECCION_INICIAL = ASEGURADORAS_AUTOS.filter((a) => a.canal !== null).map((a) => a.clave as string);

const vacio = {
  vehiculo: {
    anio: "",
    marca: "",
    modelo: "",
    version: "",
    transmision: "AUT" as "AUT" | "STD",
    serie: "",
    placas: "",
    tipo: "AUTO" as TipoVehiculo,
    procedencia: "RESIDENTE" as Procedencia,
    valor: "COMERCIAL" as ValorVehiculo,
  },
  conductor: { nombre: "", fechaNacimiento: "", sexo: "" as "H" | "M" | "", codigoPostal: "" },
};

function Campo({ id, etiqueta, children, ayuda }: { id: string; etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      {children}
      {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function Opciones<T extends string>({
  id,
  valor,
  onChange,
  opciones,
}: {
  id: string;
  valor: T;
  onChange: (v: T) => void;
  opciones: { valor: T; etiqueta: string }[];
}) {
  return (
    <Select value={valor} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Formulario para pedir una cotización de auto: se puede prellenar leyendo la INE y la tarjeta con IA. */
export function FormularioCotizacion({ hoy }: { hoy: string }) {
  const [aseguradoras, setAseguradoras] = React.useState<string[]>(SELECCION_INICIAL);
  const [vehiculo, setVehiculo] = React.useState(vacio.vehiculo);
  const [conductor, setConductor] = React.useState(vacio.conductor);
  const [coberturas, setCoberturas] = React.useState(COBERTURAS_PREDETERMINADAS);
  const [formaPago, setFormaPago] = React.useState<FormaPago>("CONTADO");
  const [notas, setNotas] = React.useState("");
  const [tipoPersona, setTipoPersona] = React.useState<TipoPersona>("FISICA");
  const [vigenciaInicio, setVigenciaInicio] = React.useState(hoy);
  const [avisosLectura, setAvisosLectura] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [leyendo, setLeyendo] = React.useState(false);
  const [enviando, startEnvio] = React.useTransition();
  const archivosRef = React.useRef<HTMLInputElement>(null);

  const edad = conductor.fechaNacimiento ? edadEn(conductor.fechaNacimiento, hoy) : null;
  // Aseguradoras marcadas que no cotizan sin la fecha de nacimiento y el sexo del conductor.
  const pidenConductor = aseguradoras
    .filter((k): k is keyof typeof ASEGURADORAS_COTIZADOR => Object.hasOwn(ASEGURADORAS_COTIZADOR, k))
    .filter((k) => ASEGURADORAS_COTIZADOR[k].pideConductor)
    .map((k) => ASEGURADORAS_COTIZADOR[k].nombre);
  const ayudaConductor = pidenConductor.length > 0 ? `Obligatorio para ${pidenConductor.join(" y ")}.` : "Opcional.";

  async function leerDocumentos(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setLeyendo(true);
    setError(null);
    try {
      const body = new FormData();
      for (const a of Array.from(archivos)) body.append("files", a);
      const res = await fetch("/api/cotizador/leer", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string; lectura?: LecturaDocumentosAuto } | null;
      if (!json?.ok || !json.lectura) {
        setError(json?.error ?? (res.status === 413 ? "Los documentos pesan demasiado." : "No se pudieron leer los documentos."));
        return;
      }
      const { vehiculo: v, conductor: c, propietario, avisos } = json.lectura;
      setVehiculo((x) => ({
        ...x,
        anio: v.anio ? String(v.anio) : x.anio,
        marca: v.marca ?? x.marca,
        modelo: v.modelo ?? x.modelo,
        version: v.version ?? x.version,
        transmision: v.transmision ?? x.transmision,
        serie: v.serie ?? x.serie,
        placas: v.placas ?? x.placas,
      }));
      setConductor((x) => ({
        nombre: c.nombre ?? x.nombre,
        fechaNacimiento: c.fechaNacimiento ?? x.fechaNacimiento,
        sexo: c.sexo ?? x.sexo,
        codigoPostal: c.codigoPostal ?? x.codigoPostal,
      }));
      setAvisosLectura([...(propietario ? [`El propietario en los documentos es ${propietario}.`] : []), ...avisos]);
      toast.success("Documentos leídos", { description: "Revisa los datos antes de enviar." });
    } catch {
      setError("Sin conexión: no se pudieron leer los documentos.");
    } finally {
      setLeyendo(false);
      if (archivosRef.current) archivosRef.current.value = "";
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startEnvio(async () => {
      const r = await crearSolicitudCotizacion({
        aseguradoras,
        vehiculo: { ...vehiculo, anio: Number(vehiculo.anio) },
        conductor: { ...conductor, sexo: conductor.sexo || null },
        tipoPersona,
        vigenciaInicio,
        coberturas,
        formaPago,
        notas,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const nombres = ASEGURADORAS_AUTOS.filter((a) => aseguradoras.includes(a.clave)).map((a) => a.nombre);
      toast.success(nombres.length > 1 ? `Enviada a ${nombres.length} aseguradoras` : "Cotización enviada al robot", {
        description: `${vehiculo.marca} ${vehiculo.modelo} ${vehiculo.anio} en ${nombres.join(", ")}.`,
      });
      setVehiculo(vacio.vehiculo);
      setConductor(vacio.conductor);
      setCoberturas(COBERTURAS_PREDETERMINADAS);
      setNotas("");
      setTipoPersona("FISICA");
      setVigenciaInicio(hoy);
      setAvisosLectura([]);
    });
  }

  const v = (campo: keyof typeof vehiculo) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVehiculo((x) => ({ ...x, [campo]: e.target.value }));
  const c = (campo: keyof typeof conductor) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConductor((x) => ({ ...x, [campo]: e.target.value }));

  const selectorSuma = (campo: CampoSuma) => (
    <Campo key={campo} id={`cot-${campo}`} etiqueta={ETIQUETA_SUMA[campo]}>
      <Opciones
        id={`cot-${campo}`}
        valor={coberturas[campo] === null ? NINGUNA : String(coberturas[campo])}
        onChange={(s) => setCoberturas((x) => ({ ...x, [campo]: s === NINGUNA ? null : Number(s) }))}
        opciones={[
          ...(OPCIONALES.includes(campo) ? [{ valor: NINGUNA, etiqueta: "No contratar" }] : []),
          ...SUMAS[campo].map((s) => ({ valor: String(s), etiqueta: `$${formatNumero(s)}` })),
        ]}
      />
    </Campo>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva cotización de auto</CardTitle>
        <CardDescription>
          Escribe los datos del auto y el código postal, o sube la tarjeta de circulación (y la INE si la tienes)
          para llenarlos solos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-6" noValidate>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
            <FileScan className="size-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Tarjeta de circulación o factura, y la INE o licencia si la tienes (fotos o PDF, hasta 4 MB entre todos).
            </p>
            <input
              ref={archivosRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              id="cotizador-documentos"
              onChange={(e) => leerDocumentos(e.target.files)}
              disabled={leyendo}
            />
            <Button type="button" variant="outline" size="sm" disabled={leyendo} onClick={() => archivosRef.current?.click()}>
              {leyendo ? <Loader2 className="animate-spin" /> : <FileScan />}
              {leyendo ? "Leyendo…" : "Leer con IA"}
            </Button>
          </div>

          {avisosLectura.length > 0 && (
            <Alert className="border-warning/30 bg-warning/10 text-warning">
              <TriangleAlert />
              <AlertDescription className="text-warning">
                <ul className="list-disc pl-4">
                  {avisosLectura.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Vehículo</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo id="cot-anio" etiqueta="Año modelo">
                <Input id="cot-anio" inputMode="numeric" maxLength={4} value={vehiculo.anio} onChange={v("anio")} placeholder="2017" />
              </Campo>
              <Campo id="cot-marca" etiqueta="Marca">
                <Input id="cot-marca" value={vehiculo.marca} onChange={v("marca")} placeholder="MAZDA" />
              </Campo>
              <Campo id="cot-modelo" etiqueta="Modelo (submarca)">
                <Input id="cot-modelo" value={vehiculo.modelo} onChange={v("modelo")} placeholder="MAZDA 3" />
              </Campo>
              <Campo id="cot-transmision" etiqueta="Transmisión">
                <Opciones
                  id="cot-transmision"
                  valor={vehiculo.transmision}
                  onChange={(t) => setVehiculo((x) => ({ ...x, transmision: t }))}
                  opciones={[
                    { valor: "AUT", etiqueta: "Automática" },
                    { valor: "STD", etiqueta: "Estándar" },
                  ]}
                />
              </Campo>
              <div className="sm:col-span-2">
                <Campo id="cot-version" etiqueta="Versión">
                  <Input id="cot-version" value={vehiculo.version} onChange={v("version")} placeholder="I TOURING 4P" />
                </Campo>
              </div>
              <Campo id="cot-serie" etiqueta="Número de serie (opcional)">
                <Input id="cot-serie" maxLength={17} value={vehiculo.serie} onChange={v("serie")} className="font-mono uppercase" />
              </Campo>
              <Campo id="cot-placas" etiqueta="Placas (opcional)">
                <Input id="cot-placas" maxLength={10} value={vehiculo.placas} onChange={v("placas")} className="uppercase" />
              </Campo>
              <Campo id="cot-tipo" etiqueta="Tipo de vehículo">
                <Opciones
                  id="cot-tipo"
                  valor={vehiculo.tipo}
                  onChange={(t: TipoVehiculo) => setVehiculo((x) => ({ ...x, tipo: t }))}
                  opciones={TIPOS_VEHICULO.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_VEHICULO[t] }))}
                />
              </Campo>
              <Campo id="cot-procedencia" etiqueta="Procedencia">
                <Opciones
                  id="cot-procedencia"
                  valor={vehiculo.procedencia}
                  onChange={(p: Procedencia) => setVehiculo((x) => ({ ...x, procedencia: p }))}
                  opciones={PROCEDENCIAS.map((p) => ({ valor: p, etiqueta: ETIQUETA_PROCEDENCIA[p] }))}
                />
              </Campo>
              <Campo id="cot-valor" etiqueta="Valor del auto">
                <Opciones
                  id="cot-valor"
                  valor={vehiculo.valor}
                  onChange={(val: ValorVehiculo) => setVehiculo((x) => ({ ...x, valor: val }))}
                  opciones={VALORES_VEHICULO.map((val) => ({ valor: val, etiqueta: ETIQUETA_VALOR[val] }))}
                />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Conductor y póliza</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo id="cot-cp" etiqueta="Código postal" ayuda="Obligatorio: define la tarifa.">
                <Input
                  id="cot-cp"
                  inputMode="numeric"
                  maxLength={5}
                  value={conductor.codigoPostal}
                  onChange={(e) => setConductor((x) => ({ ...x, codigoPostal: e.target.value.replace(/\D/g, "") }))}
                  placeholder="62260"
                />
              </Campo>
              <div className="sm:col-span-2 lg:col-span-1">
                <Campo id="cot-nombre" etiqueta="Nombre (opcional)">
                  <Input id="cot-nombre" value={conductor.nombre} onChange={c("nombre")} className="uppercase" />
                </Campo>
              </div>
              <Campo
                id="cot-nacimiento"
                etiqueta="Fecha de nacimiento"
                ayuda={edad !== null ? `${edad} años. ${ayudaConductor}` : ayudaConductor}
              >
                <Input id="cot-nacimiento" type="date" max={hoy} value={conductor.fechaNacimiento} onChange={c("fechaNacimiento")} />
              </Campo>
              <Campo id="cot-sexo" etiqueta="Sexo" ayuda={ayudaConductor}>
                <Opciones
                  id="cot-sexo"
                  valor={conductor.sexo || "-"}
                  onChange={(s) => setConductor((x) => ({ ...x, sexo: s === "-" ? "" : s }))}
                  opciones={[
                    { valor: "-", etiqueta: "—" },
                    { valor: "H", etiqueta: "Hombre" },
                    { valor: "M", etiqueta: "Mujer" },
                  ]}
                />
              </Campo>
              <Campo id="cot-persona" etiqueta="Contratante">
                <Opciones
                  id="cot-persona"
                  valor={tipoPersona}
                  onChange={setTipoPersona}
                  opciones={[
                    { valor: "FISICA", etiqueta: "Persona física" },
                    { valor: "MORAL", etiqueta: "Persona moral (empresa)" },
                  ]}
                />
              </Campo>
              <Campo id="cot-vigencia" etiqueta="Inicio de vigencia" ayuda="Un año a partir de esta fecha.">
                <Input id="cot-vigencia" type="date" min={hoy} value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Coberturas</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo id="cot-paquete" etiqueta="Paquete">
                <Opciones
                  id="cot-paquete"
                  valor={coberturas.paquete}
                  onChange={(p: Paquete) => setCoberturas((x) => ({ ...x, paquete: p }))}
                  opciones={PAQUETES.map((p) => ({ valor: p, etiqueta: ETIQUETA_PAQUETE[p] }))}
                />
              </Campo>
              <Campo id="cot-dm" etiqueta="Deducible daños materiales">
                <Opciones
                  id="cot-dm"
                  valor={String(coberturas.deducibleDM)}
                  onChange={(d) => setCoberturas((x) => ({ ...x, deducibleDM: Number(d) }))}
                  opciones={DEDUCIBLES_DM.map((d) => ({ valor: String(d), etiqueta: `${d}%` }))}
                />
              </Campo>
              <Campo id="cot-rt" etiqueta="Deducible robo total">
                <Opciones
                  id="cot-rt"
                  valor={String(coberturas.deducibleRT)}
                  onChange={(d) => setCoberturas((x) => ({ ...x, deducibleRT: Number(d) }))}
                  opciones={DEDUCIBLES_RT.map((d) => ({ valor: String(d), etiqueta: `${d}%` }))}
                />
              </Campo>
              {BASICAS.map(selectorSuma)}
              <Campo id="cot-pago" etiqueta="Forma de pago">
                <Opciones
                  id="cot-pago"
                  valor={formaPago}
                  onChange={setFormaPago}
                  opciones={FORMAS_PAGO.map((f) => ({ valor: f, etiqueta: ETIQUETA_FORMA_PAGO[f] }))}
                />
              </Campo>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={coberturas.bonificacionMaxima}
                onCheckedChange={(b) => setCoberturas((x) => ({ ...x, bonificacionMaxima: b }))}
              />
              Aplicar la bonificación técnica máxima que permita la aseguradora
            </label>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Extras <span className="font-normal text-muted-foreground">(opcional: sin nada aquí se cotiza solo el paquete básico)</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">{OPCIONALES.map(selectorSuma)}</div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {(Object.keys(EXTRAS) as Extra[]).map((extra) => (
                <label key={extra} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={coberturas.extras.includes(extra)}
                    onChange={(e) =>
                      setCoberturas((x) => ({
                        ...x,
                        extras: e.target.checked ? [...x.extras, extra] : x.extras.filter((y) => y !== extra),
                      }))
                    }
                  />
                  {EXTRAS[extra]}
                </label>
              ))}
            </div>
            <Campo id="cot-notas" etiqueta="¿Qué más se necesita?">
              <Textarea
                id="cot-notas"
                rows={2}
                maxLength={500}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej. equipo especial por rines de $20,000; el auto es de una empresa; cotizar también limitada"
              />
            </Campo>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Aseguradoras <span className="font-normal text-muted-foreground">(se cotiza en todas las que marques y se comparan juntas)</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ASEGURADORAS_AUTOS.map((a) => {
                const disponible = a.canal !== null;
                const marcada = aseguradoras.includes(a.clave);
                return (
                  <label
                    key={a.clave}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                      marcada && "border-primary/40 bg-primary/5",
                      !disponible && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      disabled={!disponible}
                      checked={marcada}
                      onChange={(e) =>
                        setAseguradoras((x) => (e.target.checked ? [...x, a.clave] : x.filter((y) => y !== a.clave)))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {a.canal === "API" ? "API" : a.canal === "ROBOT" ? "Robot" : "Próximamente"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={enviando || leyendo || aseguradoras.length === 0}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {aseguradoras.length > 1 ? `Cotizar en ${aseguradoras.length} aseguradoras` : "Enviar a cotizar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
