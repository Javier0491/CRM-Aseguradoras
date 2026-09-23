import type { Metadata } from "next";

import { CapturaWorkspace } from "@/components/captura/captura-workspace";

export const metadata: Metadata = {
  title: "Captura Inteligente",
};

export default function CapturaPage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Captura Inteligente</h1>
        <p className="text-sm text-muted-foreground">
          Extrae los datos de una póliza con IA o captúrala manualmente por ramo.
        </p>
      </div>
      <CapturaWorkspace />
    </>
  );
}
