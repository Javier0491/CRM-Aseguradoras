import type { Metadata } from "next";

import { ChatAsistente } from "@/components/asistente/chat-asistente";
import { requireUsuarioCrm } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Asistente",
};

export default async function AsistentePage() {
  const user = await requireUsuarioCrm();
  return <ChatAsistente nombre={user.nombre} />;
}
