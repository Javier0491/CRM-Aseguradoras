"use client";

import * as React from "react";

type Migraciones = { pendientes: string[] | null; fallidas: { nombre: string; error: string | null }[] };

/**
 * En una pantalla de error, consulta /api/sistema/estado: si quien la ve es SUPERADMIN y hay
 * migraciones pendientes o fallidas (la causa más común de que todo falle tras un despliegue),
 * lo dice y cómo resolverlo. Para cualquier otra cuenta no muestra nada.
 */
export function EstadoSistema() {
  const [migraciones, setMigraciones] = React.useState<Migraciones | null>(null);

  React.useEffect(() => {
    const control = new AbortController();
    fetch("/api/sistema/estado", { cache: "no-store", signal: control.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ migraciones: Migraciones }>) : null))
      .then((d) => d && setMigraciones(d.migraciones))
      .catch(() => {});
    return () => control.abort();
  }, []);

  if (!migraciones) return null;
  const pendientes = migraciones.pendientes ?? [];
  if (pendientes.length === 0 && migraciones.fallidas.length === 0) return null;
  return (
    <div
      role="alert"
      style={{ marginTop: 16, padding: 12, borderRadius: 8, border: "1px solid #ef444466", background: "#ef44441a", textAlign: "left" }}
    >
      <p style={{ fontWeight: 600, color: "#ef4444", margin: 0 }}>
        {migraciones.fallidas.length > 0
          ? `Migración fallida: ${migraciones.fallidas[0].nombre}`
          : `Hay ${pendientes.length} ${pendientes.length === 1 ? "migración pendiente" : "migraciones pendientes"} en la base de datos`}
      </p>
      <p style={{ fontSize: 13, margin: "6px 0 0" }}>
        El código desplegado espera {pendientes.length > 0 ? pendientes.join(", ") : "una migración que no terminó"}. Aplícalas con{" "}
        <code>npx prisma migrate deploy</code> y recarga.
      </p>
    </div>
  );
}
