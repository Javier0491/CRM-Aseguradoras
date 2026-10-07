"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { ArchivoInput } from "@/components/archivos/archivo-input";
import { Button } from "@/components/ui/button";
import { ARCHIVOS, validarArchivo, type TipoArchivo } from "@/lib/archivos/config";
import { subirArchivo } from "@/lib/archivos/subir";

/** Sube o reemplaza un archivo de una póliza ya registrada. */
export function ArchivoUploader({
  polizaId,
  tipo,
  reemplazar = false,
}: {
  polizaId: string;
  tipo: TipoArchivo;
  reemplazar?: boolean;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [subiendo, setSubiendo] = React.useState(false);

  async function subir() {
    if (!archivo) return;
    setError(null);
    const invalido = await validarArchivo(tipo, archivo);
    if (invalido) {
      setError(invalido);
      return;
    }
    setSubiendo(true);
    const res = await subirArchivo(polizaId, tipo, archivo);
    setSubiendo(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setArchivo(null);
    toast.success(reemplazar ? "Archivo reemplazado" : "Archivo subido", {
      description: `${ARCHIVOS[tipo].etiqueta.replace(/\s*\(.*\)$/, "")} · ${archivo.name}`,
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ArchivoInput
        tipo={tipo}
        id={`${tipo}-${polizaId}`}
        value={archivo}
        onChange={(f) => {
          setArchivo(f);
          setError(null);
        }}
        disabled={subiendo}
        invalid={Boolean(error)}
        accion={reemplazar ? "reemplazar" : "seleccionar"}
      />
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="size-3.5" /> {error}
        </p>
      )}
      {archivo && (
        <Button type="button" size="sm" onClick={subir} disabled={subiendo}>
          {subiendo ? <Loader2 className="animate-spin" /> : <UploadCloud />}
          {subiendo ? "Subiendo…" : reemplazar ? "Reemplazar archivo" : "Subir archivo"}
        </Button>
      )}
    </div>
  );
}
