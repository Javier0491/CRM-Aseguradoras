"use client";

import * as React from "react";
import Link from "next/link";
import { FileText, Loader2, Mail, MessageCircle, Phone, Send, StickyNote, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { agregarSeguimiento, eliminarSeguimiento } from "@/lib/clientes/actions";
import { MAX_TEXTO_SEGUIMIENTO, TIPOS_SEGUIMIENTO, type TipoSeguimiento } from "@/lib/clientes/reglas";

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

const ICONO: Record<TipoSeguimiento, typeof StickyNote> = {
  nota: StickyNote,
  llamada: Phone,
  whatsapp: MessageCircle,
  correo: Mail,
  reunion: Users,
};

export type RegistroSeguimiento = {
  id: string;
  tipo: string;
  texto: string;
  createdAt: Date;
  usuarioId: string | null;
  usuarioEmail: string | null;
  poliza: { id: string; numeroImpreso: string } | null;
};

const SIN_POLIZA = "__general__";

/** Bitácora de contacto con el cliente: agregar notas, llamadas, mensajes y reuniones, y verlas en orden. */
export function SeguimientoCliente({
  clienteId,
  registros,
  polizas,
  usuarioId,
  puedeBorrarTodo,
}: {
  clienteId: string;
  registros: RegistroSeguimiento[];
  polizas: { id: string; numeroImpreso: string }[];
  usuarioId: string;
  /** Administrador: puede borrar registros de otros. */
  puedeBorrarTodo: boolean;
}) {
  const [tipo, setTipo] = React.useState<TipoSeguimiento>("nota");
  const [texto, setTexto] = React.useState("");
  const [poliza, setPoliza] = React.useState(SIN_POLIZA);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, startTransition] = React.useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await agregarSeguimiento(clienteId, {
        tipo,
        texto,
        ...(poliza !== SIN_POLIZA && { polizaId: poliza }),
      });
      if (r.ok) {
        setTexto("");
        setPoliza(SIN_POLIZA);
      } else setError(r.error);
    });
  }

  return (
    <div className="divide-y">
      <form onSubmit={guardar} className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoSeguimiento)}>
            <SelectTrigger className="h-8 w-36" aria-label="Tipo de registro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_SEGUIMIENTO.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {polizas.length > 0 && (
            <Select value={poliza} onValueChange={setPoliza}>
              <SelectTrigger className="h-8 min-w-40 flex-1 sm:flex-none" aria-label="Póliza relacionada">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_POLIZA}>Sin póliza en particular</SelectItem>
                {polizas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.numeroImpreso}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          rows={3}
          maxLength={MAX_TEXTO_SEGUIMIENTO}
          placeholder="¿Qué se habló o qué se acordó?"
          aria-label="Texto del registro"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-destructive">{error}</p>
          <Button type="submit" size="sm" disabled={pendiente || !texto.trim()}>
            {pendiente ? <Loader2 className="animate-spin" /> : <Send />} Registrar
          </Button>
        </div>
      </form>
      {registros.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">Sin registros de seguimiento.</p>
      ) : (
        <ol className="divide-y">
          {registros.map((r) => (
            <Registro key={r.id} r={r} puedeBorrar={puedeBorrarTodo || r.usuarioId === usuarioId} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Registro({ r, puedeBorrar }: { r: RegistroSeguimiento; puedeBorrar: boolean }) {
  const [pendiente, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const tipo = TIPOS_SEGUIMIENTO.find((t) => t.value === r.tipo);
  const Icono = ICONO[(tipo?.value ?? "nota") as TipoSeguimiento];
  return (
    <li className="group flex items-start gap-3 px-5 py-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-primary">
        <Icono className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{tipo?.label ?? r.tipo}</span> · {fechaHora.format(r.createdAt)}
          {r.usuarioEmail && ` · ${r.usuarioEmail}`}
          {r.poliza && (
            <>
              {" · "}
              <Link href={`/polizas/${r.poliza.id}`} className="inline-flex items-center gap-1 font-mono hover:text-primary hover:underline">
                <FileText className="size-3" /> {r.poliza.numeroImpreso}
              </Link>
            </>
          )}
        </p>
        <p className="text-sm whitespace-pre-line">{r.texto}</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      {puedeBorrar && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          disabled={pendiente}
          aria-label="Borrar registro"
          onClick={() =>
            startTransition(async () => {
              const res = await eliminarSeguimiento(r.id);
              if (!res.ok) setError(res.error);
            })
          }
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      )}
    </li>
  );
}
