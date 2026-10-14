import type { Metadata } from "next";

import { ChatAsistente } from "@/components/asistente/chat-asistente";
import { COLOR_MARCA_PREDETERMINADO } from "@/lib/agencias/marca";
import { getAgencia } from "@/lib/agencias/queries";
import { nombreAsistente } from "@/lib/asistente/marca";
import { requireUsuarioCrm } from "@/lib/auth/dal";
import { normalizarHex } from "@/lib/color";

export function generateMetadata(): Metadata {
  return { title: nombreAsistente() };
}

export default async function AsistentePage() {
  const user = await requireUsuarioCrm();
  const agencia = await getAgencia(user.agenciaId);
  return (
    <ChatAsistente
      asistente={nombreAsistente()}
      usuario={user.nombre}
      color={normalizarHex(agencia.colorHex) ?? COLOR_MARCA_PREDETERMINADO}
    />
  );
}
