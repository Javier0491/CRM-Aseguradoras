"use client";

import * as React from "react";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { AseguradoraTag } from "@/components/polizas/poliza-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guardarConfigAvisos } from "@/lib/avisos/actions";
import { MAX_DIAS_AVISO, MIN_DIAS_AVISO, TIPOS_AVISO, type CampoAviso, type DiasAviso } from "@/lib/avisos/reglas";

type AseguradoraAvisos = { id: string; nombre: string; color_hex: string; diasGracia: number } & DiasAviso;
/** Texto de cada celda: se permite vaciarla mientras se escribe. */
type Celdas = Record<string, Record<CampoAviso, string>>;

const aCeldas = (aseguradoras: AseguradoraAvisos[]): Celdas =>
  Object.fromEntries(
    aseguradoras.map((a) => [
      a.id,
      Object.fromEntries(TIPOS_AVISO.map((t) => [t.campo, a[t.campo]?.toString() ?? ""])) as Record<CampoAviso, string>,
    ])
  );

/** Matriz (solo ADMIN): días de cada aviso por aseguradora y correo de copia de la agencia. */
export function MatrizAvisos({ correoCopia, aseguradoras }: { correoCopia: string; aseguradoras: AseguradoraAvisos[] }) {
  const [copia, setCopia] = React.useState(correoCopia);
  const [celdas, setCeldas] = React.useState(() => aCeldas(aseguradoras));
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, startGuardar] = React.useTransition();

  function cambiar(id: string, campo: CampoAviso, valor: string) {
    setCeldas((c) => ({ ...c, [id]: { ...c[id], [campo]: valor.replace(/\D/g, "").slice(0, 2) } }));
    setError(null);
  }

  function guardar() {
    const filas = aseguradoras.map((a) => ({
      aseguradoraId: a.id,
      ...(Object.fromEntries(
        TIPOS_AVISO.map((t) => [t.campo, celdas[a.id][t.campo] === "" ? null : Number(celdas[a.id][t.campo])])
      ) as DiasAviso),
    }));
    const invalida = filas.some((f) =>
      TIPOS_AVISO.some((t) => f[t.campo] !== null && (f[t.campo]! < MIN_DIAS_AVISO || f[t.campo]! > MAX_DIAS_AVISO))
    );
    if (invalida) {
      setError(`Los días deben estar entre ${MIN_DIAS_AVISO} y ${MAX_DIAS_AVISO}, o quedar en blanco.`);
      return;
    }
    startGuardar(async () => {
      const r = await guardarConfigAvisos({ correoCopia: copia, filas });
      if (r.ok) {
        setError(null);
        toast.success("Matriz de avisos guardada");
      } else setError(r.error);
    });
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
        <CardTitle className="text-base">Matriz de avisos</CardTitle>
        <CardDescription>
          Un recibo ya pagado o conciliado no recibe avisos, y una póliza con su renovación capturada tampoco. Cada
          aviso se envía una sola vez. El segundo aviso de cobro sale los días indicados después del primero (por
          ejemplo, 10) solo si el recibo sigue sin pagarse.
        </CardDescription>
      </CardHeader>

      <CardContent className="border-b px-5 py-5">
        <div className="max-w-md space-y-2">
          <Label htmlFor="avisos-copia">Correo de copia</Label>
          <Input
            id="avisos-copia"
            type="email"
            value={copia}
            maxLength={254}
            autoComplete="off"
            placeholder="servicios@tuagencia.com"
            onChange={(e) => {
              setCopia(e.target.value);
              setError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Obligatorio: recibe copia oculta de cada aviso y las respuestas de los clientes. Mientras esté en blanco no se
            envía ningún aviso de esta agencia.
          </p>
        </div>
      </CardContent>

      {aseguradoras.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Aún no hay aseguradoras registradas.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Aseguradora</TableHead>
              {TIPOS_AVISO.map((t) => (
                <TableHead key={t.clave} className="py-2">
                  {t.titulo}
                  <span className="block text-xs font-normal text-muted-foreground">{t.ayuda}</span>
                </TableHead>
              ))}
              <TableHead className="pr-5">Días de gracia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aseguradoras.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-5">
                  <AseguradoraTag nombre={a.nombre} color={a.color_hex} />
                </TableCell>
                {TIPOS_AVISO.map((t) => (
                  <TableCell key={t.clave}>
                    <Input
                      inputMode="numeric"
                      value={celdas[a.id][t.campo]}
                      placeholder="—"
                      aria-label={`${t.titulo} · ${a.nombre}`}
                      onChange={(e) => cambiar(a.id, t.campo, e.target.value)}
                      className="w-20 text-right tabular-nums"
                    />
                  </TableCell>
                ))}
                <TableCell className="pr-5 tabular-nums text-muted-foreground">{a.diasGracia}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CardFooter className="justify-between gap-3 border-t px-5 py-4 [.border-t]:pt-4">
        <p className="flex items-center gap-2 text-sm text-destructive">
          {error && <AlertCircle className="size-4 shrink-0" />}
          {error}
        </p>
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </CardFooter>
    </Card>
  );
}
