"use client";

import * as React from "react";
import { AlertTriangle, Braces, Eye, PencilLine, RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  marcador,
  tokenizar,
  VARIABLES,
  valoresDeRecibo,
  variablesDesconocidas,
  type Plantilla,
  type ReciboCobranza,
} from "@/lib/comunicaciones/plantillas";

type CampoEditable = "asunto" | "cuerpo";

export function PlantillaEditor({
  plantillas,
  plantillaId,
  recibo,
  onCambiarPlantilla,
  onGuardar,
}: {
  plantillas: Plantilla[];
  plantillaId: string;
  recibo: ReciboCobranza;
  onCambiarPlantilla: (id: string) => void;
  onGuardar: (plantilla: Plantilla) => void;
}) {
  const guardada = plantillas.find((p) => p.id === plantillaId) ?? plantillas[0];
  const [borrador, setBorrador] = React.useState({
    asunto: guardada.asunto,
    cuerpo: guardada.cuerpo,
  });
  const asuntoRef = React.useRef<HTMLInputElement>(null);
  const cuerpoRef = React.useRef<HTMLTextAreaElement>(null);
  const ultimoCampo = React.useRef<CampoEditable>("cuerpo");

  const modificada =
    borrador.asunto !== guardada.asunto || borrador.cuerpo !== guardada.cuerpo;
  const desconocidas = variablesDesconocidas(`${borrador.asunto}\n${borrador.cuerpo}`);

  function insertarVariable(clave: string) {
    const campo = ultimoCampo.current;
    const el = campo === "asunto" ? asuntoRef.current : cuerpoRef.current;
    const texto = borrador[campo];
    const inicio = el?.selectionStart ?? texto.length;
    const fin = el?.selectionEnd ?? texto.length;
    const insercion = marcador(clave);
    setBorrador((b) => ({
      ...b,
      [campo]: texto.slice(0, inicio) + insercion + texto.slice(fin),
    }));
    // Restaura el foco y coloca el cursor después de la variable insertada.
    requestAnimationFrame(() => {
      el?.focus();
      const pos = inicio + insercion.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function cambiarPlantilla(id: string) {
    const siguiente = plantillas.find((p) => p.id === id);
    if (!siguiente) return;
    setBorrador({ asunto: siguiente.asunto, cuerpo: siguiente.cuerpo });
    onCambiarPlantilla(id);
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="text-base">Editor de Plantillas de Correo</CardTitle>
        <CardDescription>
          Personaliza el asunto y el cuerpo; las variables se sustituyen al enviar.
        </CardDescription>
      </CardHeader>

      <Tabs defaultValue="editar" className="gap-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <Select value={guardada.id} onValueChange={cambiarPlantilla}>
            <SelectTrigger className="w-64 bg-background" aria-label="Plantilla">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plantillas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TabsList className="ml-auto">
            <TabsTrigger value="editar">
              <PencilLine /> Editar
            </TabsTrigger>
            <TabsTrigger value="vista">
              <Eye /> Vista previa
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="editar">
          <CardContent className="space-y-5 px-5 py-5">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Braces className="size-3.5 text-primary" />
                Insertar variable en el campo activo
              </p>
              <div className="flex flex-wrap gap-2">
                {VARIABLES.map((v) => (
                  <button
                    key={v.clave}
                    type="button"
                    title={v.label}
                    // Evita que el botón robe el foco y se pierda la posición del cursor.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertarVariable(v.clave)}
                    className="rounded-md border border-primary/30 bg-primary/[0.06] px-2 py-1 font-mono text-xs text-primary transition-colors hover:border-primary/60 hover:bg-primary/[0.12] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {marcador(v.clave)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plantilla-asunto" className="text-xs">
                Asunto
              </Label>
              <Input
                id="plantilla-asunto"
                ref={asuntoRef}
                value={borrador.asunto}
                onFocus={() => (ultimoCampo.current = "asunto")}
                onChange={(e) => setBorrador((b) => ({ ...b, asunto: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plantilla-cuerpo" className="text-xs">
                Cuerpo del mensaje
              </Label>
              <Textarea
                id="plantilla-cuerpo"
                ref={cuerpoRef}
                value={borrador.cuerpo}
                onFocus={() => (ultimoCampo.current = "cuerpo")}
                onChange={(e) => setBorrador((b) => ({ ...b, cuerpo: e.target.value }))}
                className="min-h-72 resize-y text-sm leading-relaxed"
              />
            </div>

            {desconocidas.length > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                Variables no reconocidas: {desconocidas.map(marcador).join(", ")}. No se
                sustituirán al enviar.
              </p>
            )}
          </CardContent>
        </TabsContent>

        <TabsContent value="vista">
          <CardContent className="px-5 py-5">
            <VistaPrevia asunto={borrador.asunto} cuerpo={borrador.cuerpo} recibo={recibo} />
          </CardContent>
        </TabsContent>
      </Tabs>

      <CardFooter className="flex items-center gap-2 border-t px-5 py-3 [.border-t]:pt-3">
        <span className="mr-auto text-xs text-muted-foreground">
          {modificada ? "Cambios sin guardar" : "Plantilla guardada"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!modificada}
          onClick={() => setBorrador({ asunto: guardada.asunto, cuerpo: guardada.cuerpo })}
        >
          <RotateCcw /> Descartar
        </Button>
        <Button
          size="sm"
          disabled={!modificada}
          onClick={() => onGuardar({ ...guardada, ...borrador })}
        >
          <Save /> Guardar plantilla
        </Button>
      </CardFooter>
    </Card>
  );
}

function TextoConVariables({ texto, valores }: { texto: string; valores: Record<string, string> }) {
  return tokenizar(texto, valores).map((t, i) =>
    t.tipo === "texto" ? (
      <React.Fragment key={i}>{t.valor}</React.Fragment>
    ) : t.valor !== null ? (
      <mark key={i} className="rounded-sm bg-primary/15 px-0.5 text-primary">
        {t.valor}
      </mark>
    ) : (
      <mark key={i} className="rounded-sm bg-destructive/15 px-0.5 font-mono text-destructive">
        {marcador(t.clave)}
      </mark>
    )
  );
}

function VistaPrevia({
  asunto,
  cuerpo,
  recibo,
}: {
  asunto: string;
  cuerpo: string;
  recibo: ReciboCobranza;
}) {
  const valores = valoresDeRecibo(recibo);
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <dl className="divide-y border-b text-sm">
        <div className="flex gap-3 px-4 py-2.5">
          <dt className="w-14 shrink-0 text-muted-foreground">De</dt>
          <dd>cobranza@pjmagnus.mx</dd>
        </div>
        <div className="flex gap-3 px-4 py-2.5">
          <dt className="w-14 shrink-0 text-muted-foreground">Para</dt>
          <dd className="truncate">
            {recibo.cliente} <span className="text-muted-foreground">&lt;{recibo.email}&gt;</span>
          </dd>
        </div>
        <div className="flex gap-3 px-4 py-2.5">
          <dt className="w-14 shrink-0 text-muted-foreground">Asunto</dt>
          <dd className="font-medium">
            <TextoConVariables texto={asunto} valores={valores} />
          </dd>
        </div>
      </dl>
      <div className="px-4 py-5 text-sm leading-relaxed whitespace-pre-wrap">
        <TextoConVariables texto={cuerpo} valores={valores} />
      </div>
    </div>
  );
}
