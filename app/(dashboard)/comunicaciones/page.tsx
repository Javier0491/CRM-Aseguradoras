import type { Metadata } from "next";
import { BellRing, Mail } from "lucide-react";

import { ComunicacionesWorkspace } from "@/components/comunicaciones/comunicaciones-workspace";
import { RedactorCorreo } from "@/components/comunicaciones/redactor-correo";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getMarcaCorreo } from "@/lib/agencias/queries";
import { getAgenciaId } from "@/lib/auth/dal";
import { remitenteDeAgencia } from "@/lib/comunicaciones/correo";
import { plantillasIniciales, recibosPorCobrar } from "@/lib/comunicaciones/data";
import { getDirectorioCorreo } from "@/lib/comunicaciones/queries";

export const metadata: Metadata = {
  title: "Comunicaciones",
};

export default async function ComunicacionesPage() {
  const { clientes, sinCorreo } = await getDirectorioCorreo();
  const marca = await getMarcaCorreo(await getAgenciaId());
  // Dirección universal de la plataforma, con el nombre de la agencia como remitente.
  const direccion = process.env.EMAIL_SENDER?.trim() || null;
  const remitente = direccion ? remitenteDeAgencia(direccion, marca.nombre) : null;
  const configurado = Boolean(remitente && process.env.RESEND_API_KEY);

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Comunicaciones</h1>
        <p className="text-sm text-muted-foreground">
          Envía correos individuales o masivos a tus clientes con el formato de la empresa.
        </p>
      </div>

      <Tabs defaultValue="correo" className="gap-6">
        <TabsList>
          <TabsTrigger value="correo">
            <Mail /> Correo a clientes
          </TabsTrigger>
          <TabsTrigger value="cobranza">
            <BellRing /> Avisos de cobranza
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-[10px] font-medium text-warning">
              Ejemplo
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="correo">
          <RedactorCorreo
            clientes={clientes}
            sinCorreo={sinCorreo}
            remitente={configurado ? remitente : null}
            marca={marca}
          />
        </TabsContent>
        <TabsContent value="cobranza">
          <ComunicacionesWorkspace recibos={recibosPorCobrar} plantillasIniciales={plantillasIniciales} />
        </TabsContent>
      </Tabs>
    </>
  );
}
