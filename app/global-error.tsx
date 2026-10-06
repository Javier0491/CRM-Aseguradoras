"use client";

import { useEffect } from "react";

import { EstadoSistema } from "@/components/layout/estado-sistema";

/**
 * Último recurso: un error en el layout raíz (p. ej. la sesión no se pudo leer porque faltan
 * migraciones). Renderiza su propio documento, sin los estilos de la aplicación.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es-MX">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
          padding: 16,
        }}
      >
        <title>Algo salió mal</title>
        <main style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Algo salió mal</h1>
          <p style={{ color: "#a1a1aa", fontSize: 14, margin: 0 }}>
            No se pudo cargar el CRM. Intenta de nuevo en un momento; si sigue igual, avisa al administrador de la
            plataforma.
            {error.digest && <span style={{ display: "block", fontFamily: "monospace", fontSize: 12, marginTop: 6 }}>ref: {error.digest}</span>}
          </p>
          <EstadoSistema />
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #3f3f46",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
