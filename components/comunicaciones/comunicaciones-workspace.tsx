"use client";

import * as React from "react";

import { PlantillaEditor } from "@/components/comunicaciones/plantilla-editor";
import { RecibosPanel, type RegistroEnvio } from "@/components/comunicaciones/recibos-panel";
import type { Plantilla, ReciboCobranza } from "@/lib/comunicaciones/plantillas";

const hora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

export function ComunicacionesWorkspace({
  recibos,
  plantillasIniciales,
}: {
  recibos: ReciboCobranza[];
  plantillasIniciales: Plantilla[];
}) {
  const [plantillas, setPlantillas] = React.useState(plantillasIniciales);
  const [plantillaId, setPlantillaId] = React.useState(plantillasIniciales[0].id);
  const [seleccionado, setSeleccionado] = React.useState(recibos[0].folio);
  const [envios, setEnvios] = React.useState<Record<string, RegistroEnvio>>({});

  const recibo = recibos.find((r) => r.folio === seleccionado) ?? recibos[0];
  const plantilla = plantillas.find((p) => p.id === plantillaId) ?? plantillas[0];

  function enviar(folio: string) {
    setSeleccionado(folio);
    // TODO: invocar el servicio de correo (Server Action) con la plantilla renderizada.
    setEnvios((prev) => ({
      ...prev,
      [folio]: { plantilla: plantilla.nombre, hora: hora.format(new Date()) },
    }));
  }

  function guardar(actualizada: Plantilla) {
    // TODO: persistir la plantilla en base de datos.
    setPlantillas((prev) => prev.map((p) => (p.id === actualizada.id ? actualizada : p)));
  }

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(0,7fr)]">
      <RecibosPanel
        recibos={recibos}
        seleccionado={seleccionado}
        envios={envios}
        onSeleccionar={setSeleccionado}
        onEnviar={enviar}
      />
      <PlantillaEditor
        plantillas={plantillas}
        plantillaId={plantillaId}
        recibo={recibo}
        onCambiarPlantilla={setPlantillaId}
        onGuardar={guardar}
      />
    </div>
  );
}
