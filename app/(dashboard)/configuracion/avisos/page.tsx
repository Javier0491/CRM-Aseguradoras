import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { MatrizAvisos } from "@/components/avisos/matriz-avisos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Avisos automáticos",
};

export default async function AvisosAutomaticosPage() {
  const { agenciaId } = await requireAdmin();
  const [agencia, aseguradoras] = await Promise.all([
    db.agencia.findUniqueOrThrow({ where: { id: agenciaId }, select: { correoCopiaAvisos: true } }),
    db.aseguradora.findMany({
      where: { agenciaId },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        color_hex: true,
        diasGracia: true,
        avisoDiasAntes: true,
        avisoDiasVencido: true,
        avisoDiasRenovacion: true,
      },
    }),
  ]);
  const faltantes = ["RESEND_API_KEY", "EMAIL_SENDER", "CRON_SECRET"].filter((v) => !process.env[v]?.trim());

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Avisos automáticos</h1>
        <p className="text-sm text-muted-foreground">
          Correos que el CRM envía solo a los clientes, con el logo y los colores de la agencia. Los días de cada
          aviso se definen por aseguradora; una celda en blanco significa que ese aviso no se envía.
        </p>
      </div>

      {faltantes.length > 0 && (
        <Alert className="border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle />
          <AlertTitle>El envío automático aún no está activo</AlertTitle>
          <AlertDescription className="text-warning/90">
            Puedes dejar lista la matriz, pero no saldrá ningún aviso hasta configurar en el servidor:{" "}
            {faltantes.join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      {!agencia.correoCopiaAvisos && (
        <Alert className="border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle />
          <AlertTitle>Falta el correo de copia</AlertTitle>
          <AlertDescription className="text-warning/90">
            No saldrá ningún aviso de esta agencia hasta que captures y guardes su correo de copia.
          </AlertDescription>
        </Alert>
      )}

      <MatrizAvisos correoCopia={agencia.correoCopiaAvisos ?? ""} aseguradoras={aseguradoras} />
    </>
  );
}
