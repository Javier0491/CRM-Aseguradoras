import type { Metadata } from "next";
import { FolderUp } from "lucide-react";

import { CargaMasiva } from "@/components/captura/carga-masiva";
import { EncabezadoModulo } from "@/components/layout/encabezado-modulo";
import { requireAdmin, veComisiones } from "@/lib/auth/dal";
import { getAseguradorasOpciones } from "@/lib/polizas/queries";
import { getEjecutivos } from "@/lib/usuarios/queries";

export const metadata: Metadata = {
  title: "Carga masiva",
};

export default async function CargaMasivaPage() {
  const user = await requireAdmin();
  const [aseguradoras, ejecutivos] = await Promise.all([getAseguradorasOpciones(), getEjecutivos(user.agenciaId)]);
  return (
    <>
      <EncabezadoModulo
        icono={FolderUp}
        titulo="Carga masiva"
        descripcion="Sube tu carpeta de pólizas completa: la IA las lee una por una, guarda las que no tienen dudas y te deja las demás listas para revisar."
      />
      <CargaMasiva
        usuarioId={user.id}
        aseguradoras={aseguradoras}
        verComisiones={veComisiones(user)}
        ejecutivos={ejecutivos}
        ejecutivoPredeterminado={ejecutivos.some((e) => e.id === user.id) ? user.id : ""}
      />
    </>
  );
}
