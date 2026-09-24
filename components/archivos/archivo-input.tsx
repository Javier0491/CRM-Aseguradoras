"use client";

import * as React from "react";
import { FileArchive, FileText, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ARCHIVOS, formatBytes, type TipoArchivo } from "@/lib/archivos/config";
import { cn } from "@/lib/utils";

/** Selector de un archivo de póliza (arrastrar o clic). La validación la hace quien lo usa. */
export function ArchivoInput({
  tipo,
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
}: {
  tipo: TipoArchivo;
  id: string;
  value: File | null;
  onChange: (archivo: File | null) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = React.useState(false);
  const def = ARCHIVOS[tipo];
  const Icono = def.verEnLinea ? FileText : FileArchive;

  if (value) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border bg-background/60 p-3",
          invalid && "border-destructive"
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-primary">
          <Icono className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(value.size)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Quitar archivo"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => inputRef.current?.click()}
        onBlur={onBlur}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const archivo = e.dataTransfer.files[0];
          if (archivo && !disabled) onChange(archivo);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-dashed bg-background/60 px-4 py-3 text-left transition-colors outline-none",
          "hover:border-primary/60 hover:bg-primary/[0.03] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40",
          "disabled:pointer-events-none disabled:opacity-50",
          arrastrando && "border-primary bg-primary/[0.06]",
          invalid && "border-destructive"
        )}
      >
        <UploadCloud className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">
            {arrastrando
              ? "Suelta el archivo aquí"
              : `Arrastra el ${def.extension.toUpperCase()} o haz clic para seleccionar`}
          </span>
          <span className="block text-xs text-muted-foreground">
            Solo .{def.extension} · máximo {formatBytes(def.maxBytes)}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={def.accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </>
  );
}
