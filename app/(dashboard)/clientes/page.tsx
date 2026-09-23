import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/layout/module-placeholder";

export const metadata: Metadata = {
  title: "Directorio de Clientes",
};

export default function Page() {
  return <ModulePlaceholder title="Directorio de Clientes" />;
}
