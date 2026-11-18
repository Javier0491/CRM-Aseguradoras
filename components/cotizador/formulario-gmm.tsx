"use client";

import * as React from "react";
import { Loader2, Plus, Send, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Campo, Opciones } from "@/components/cotizador/formulario-cotizacion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { crearSolicitudCotizacion } from "@/lib/cotizador/actions";
import type { AseguradoraDelRamo } from "@/lib/cotizador/aseguradoras";
import {
  ADICIONALES_GMM,
  COASEGUROS,
  ESTADOS_MX,
  ETIQUETA_NIVEL,
  ETIQUETA_PARENTESCO,
  GMM_PREDETERMINADO,
  MAX_ASEGURADOS,
  NIVELES_PLAN,
  type AdicionalGMM,
  type EstadoMx,
  type NivelPlan,
  type Parentesco,
} from "@/lib/cotizador/gmm";
import { edadEn, ETIQUETA_FORMA_PAGO, FORMAS_PAGO, type FormaPago } from "@/lib/cotizador/reglas";
import { formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";

const RECOMENDADA = "portal";
const millones = (...m: number[]) => m.map((x) => x * 1_000_000);
const miles = (...m: number[]) => m.map((x) => x * 1_000);
// Sumas y deducibles comunes; el robot toma la opción más cercana de cada portal y avisa si no es igual.
const SUMAS = millones(1, 2, 3, 5, 7, 10, 20, 30, 50, 80);
const DEDUCIBLES = miles(10, 12.5, 20, 25, 30, 40, 50, 75, 100);

type AseguradoForm = { parentesco: Parentesco; nombre: string; fechaNacimiento: string; sexo: "H" | "M" | "" };
const titularVacio: AseguradoForm = { parentesco: "TITULAR", nombre: "", fechaNacimiento: "", sexo: "" };

const opcionMonto = (valores: number[], etiquetaPortal: string) => [
  { valor: RECOMENDADA, etiqueta: etiquetaPortal },
  ...valores.map((m) => ({ valor: String(m), etiqueta: `$${formatNumero(m)}` })),
];

/** Formulario de Gastos Médicos Mayores: asegurados, domicilio, plan y coberturas. */
export function FormularioGMM({ hoy, aseguradoras: opciones }: { hoy: string; aseguradoras: AseguradoraDelRamo[] }) {
  const [marcadas, setAseguradoras] = React.useState<string[]>(() => opciones.filter((a) => a.canal === "ROBOT").map((a) => a.clave));
  const aseguradoras = marcadas.filter((k) => opciones.some((a) => a.clave === k && a.canal === "ROBOT"));
  const [asegurados, setAsegurados] = React.useState<AseguradoForm[]>([titularVacio]);
  const [codigoPostal, setCodigoPostal] = React.useState("");
  const [estado, setEstado] = React.useState<EstadoMx | "">("");
  const [municipio, setMunicipio] = React.useState("");
  const [plan, setPlan] = React.useState<NivelPlan>(GMM_PREDETERMINADO.plan);
  const [sumaAsegurada, setSuma] = React.useState<string>(RECOMENDADA);
  const [deducible, setDeducible] = React.useState<string>(RECOMENDADA);
  const [coaseguro, setCoaseguro] = React.useState<string>(String(GMM_PREDETERMINADO.coaseguro));
  const [adicionales, setAdicionales] = React.useState<AdicionalGMM[]>([]);
  const [formaPago, setFormaPago] = React.useState<FormaPago>(GMM_PREDETERMINADO.formaPago);
  const [notas, setNotas] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [enviando, startEnvio] = React.useTransition();

  const hayConyuge = asegurados.some((a) => a.parentesco === "CONYUGE");
  const cambiar = (i: number, campo: keyof AseguradoForm, valor: string) =>
    setAsegurados((x) => x.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)));
  const agregar = (parentesco: Parentesco) =>
    setAsegurados((x) => (x.length >= MAX_ASEGURADOS ? x : [...x, { parentesco, nombre: "", fechaNacimiento: "", sexo: "" }]));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startEnvio(async () => {
      const r = await crearSolicitudCotizacion({
        ramo: "GMM",
        aseguradoras,
        asegurados: asegurados.map((a) => ({ ...a, sexo: a.sexo || null })),
        codigoPostal,
        estado,
        municipio,
        plan,
        sumaAsegurada: sumaAsegurada === RECOMENDADA ? null : Number(sumaAsegurada),
        deducible: deducible === RECOMENDADA ? null : Number(deducible),
        coaseguro: coaseguro === RECOMENDADA ? null : Number(coaseguro),
        adicionales,
        formaPago,
        notas,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const nombres = opciones.filter((a) => aseguradoras.includes(a.clave)).map((a) => a.nombre);
      toast.success(nombres.length > 1 ? `Enviada a ${nombres.length} aseguradoras` : "Cotización enviada al robot", {
        description: `Gastos médicos en ${nombres.join(", ")}.`,
      });
      setAsegurados([titularVacio]);
      setAdicionales([]);
      setNotas("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva cotización de gastos médicos</CardTitle>
        <CardDescription>
          Captura a cada asegurado con su fecha de nacimiento y sexo (de ahí sale la edad que piden las aseguradoras), el
          domicilio del titular y el plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-6" noValidate>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Asegurados</legend>
            {asegurados.map((a, i) => {
              const edad = a.fechaNacimiento ? edadEn(a.fechaNacimiento, hoy) : null;
              return (
                <div key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
                  <Campo id={`gmm-nombre-${i}`} etiqueta={`${ETIQUETA_PARENTESCO[a.parentesco]} · nombre (opcional)`}>
                    <Input id={`gmm-nombre-${i}`} value={a.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} />
                  </Campo>
                  <Campo id={`gmm-fn-${i}`} etiqueta={edad !== null && edad >= 0 ? `Nacimiento (${edad} años)` : "Fecha de nacimiento"}>
                    <Input id={`gmm-fn-${i}`} type="date" max={hoy} value={a.fechaNacimiento} onChange={(e) => cambiar(i, "fechaNacimiento", e.target.value)} />
                  </Campo>
                  <Campo id={`gmm-sexo-${i}`} etiqueta="Sexo">
                    <Opciones
                      id={`gmm-sexo-${i}`}
                      valor={a.sexo || "-"}
                      onChange={(s) => cambiar(i, "sexo", s === "-" ? "" : s)}
                      opciones={[
                        ...(a.sexo ? [] : [{ valor: "-", etiqueta: "Elige" }]),
                        { valor: "H", etiqueta: "Hombre" },
                        { valor: "M", etiqueta: "Mujer" },
                      ]}
                    />
                  </Campo>
                  {i === 0 ? (
                    <span className="hidden w-9 sm:block" />
                  ) : (
                    <Button type="button" variant="ghost" size="icon" title="Quitar" onClick={() => setAsegurados((x) => x.filter((_, j) => j !== i))}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              {!hayConyuge && (
                <Button type="button" variant="outline" size="sm" onClick={() => agregar("CONYUGE")} disabled={asegurados.length >= MAX_ASEGURADOS}>
                  <Plus /> Cónyuge
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => agregar("HIJO")} disabled={asegurados.length >= MAX_ASEGURADOS}>
                <Plus /> Hijo(a)
              </Button>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Domicilio del titular</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo id="gmm-cp" etiqueta="Código postal">
                <Input id="gmm-cp" inputMode="numeric" maxLength={5} value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value.replace(/\D/g, ""))} />
              </Campo>
              <Campo id="gmm-estado" etiqueta="Estado">
                <Opciones
                  id="gmm-estado"
                  valor={estado || "-"}
                  onChange={(s) => setEstado(s === "-" ? "" : (s as EstadoMx))}
                  opciones={[...(estado ? [] : [{ valor: "-", etiqueta: "Elige" }]), ...ESTADOS_MX.map((x) => ({ valor: x, etiqueta: x }))]}
                />
              </Campo>
              <Campo id="gmm-municipio" etiqueta="Municipio">
                <Input id="gmm-municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="ZAPOPAN" />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Plan y coberturas</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Campo id="gmm-plan" etiqueta="Nivel del plan" ayuda="Cada aseguradora le pone su nombre; el robot elige el equivalente.">
                <Opciones id="gmm-plan" valor={plan} onChange={setPlan} opciones={NIVELES_PLAN.map((n) => ({ valor: n, etiqueta: ETIQUETA_NIVEL[n] }))} />
              </Campo>
              <Campo id="gmm-suma" etiqueta="Suma asegurada">
                <Opciones id="gmm-suma" valor={sumaAsegurada} onChange={setSuma} opciones={opcionMonto(SUMAS, "La que recomiende la aseguradora")} />
              </Campo>
              <Campo id="gmm-deducible" etiqueta="Deducible">
                <Opciones id="gmm-deducible" valor={deducible} onChange={setDeducible} opciones={opcionMonto(DEDUCIBLES, "El que recomiende la aseguradora")} />
              </Campo>
              <Campo id="gmm-coaseguro" etiqueta="Coaseguro">
                <Opciones
                  id="gmm-coaseguro"
                  valor={coaseguro}
                  onChange={setCoaseguro}
                  opciones={[{ valor: RECOMENDADA, etiqueta: "El de la aseguradora" }, ...COASEGUROS.map((c) => ({ valor: String(c), etiqueta: `${c}%` }))]}
                />
              </Campo>
              <Campo id="gmm-pago" etiqueta="Forma de pago">
                <Opciones id="gmm-pago" valor={formaPago} onChange={setFormaPago} opciones={FORMAS_PAGO.map((f) => ({ valor: f, etiqueta: ETIQUETA_FORMA_PAGO[f] }))} />
              </Campo>
            </div>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {(Object.keys(ADICIONALES_GMM) as AdicionalGMM[]).map((x) => (
                <label key={x} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={adicionales.includes(x)}
                    onChange={(e) => setAdicionales((y) => (e.target.checked ? [...y, x] : y.filter((z) => z !== x)))}
                  />
                  {ADICIONALES_GMM[x]}
                </label>
              ))}
            </div>
            <Campo id="gmm-notas" etiqueta="¿Qué más se necesita?">
              <Textarea
                id="gmm-notas"
                rows={2}
                maxLength={500}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej. comparar también con deducible de $20,000; el titular tiene diabetes controlada"
              />
            </Campo>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">
              Aseguradoras <span className="font-normal text-muted-foreground">(se cotiza en todas las que marques y se comparan juntas)</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {opciones.map((a) => {
                const disponible = a.canal === "ROBOT";
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
                      onChange={(e) => setAseguradoras((x) => (e.target.checked ? [...x, a.clave] : x.filter((y) => y !== a.clave)))}
                    />
                    <span className="min-w-0 flex-1 truncate">{a.nombre}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {a.apagada ? "Apagada" : a.canal === "API" ? "API (pronto)" : a.canal === "ROBOT" ? "Robot" : "Próximamente"}
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
            <Button type="submit" disabled={enviando || aseguradoras.length === 0}>
              {enviando ? <Loader2 className="animate-spin" /> : <Send />}
              {aseguradoras.length > 1 ? `Cotizar en ${aseguradoras.length} aseguradoras` : "Enviar a cotizar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
