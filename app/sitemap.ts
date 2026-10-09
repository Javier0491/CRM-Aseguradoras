import type { MetadataRoute } from "next";

import { SITIO } from "@/lib/sitio";

// Todo el CRM requiere sesión (proxy.ts); la única URL pública es la raíz, con la landing. Los
// planes son una sección de ella (/#planes) y los buscadores no indexan los "#".
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: SITIO, lastModified: new Date(), changeFrequency: "monthly", priority: 1 },
    // Rutas dinámicas: solo contenido PÚBLICO (nunca pólizas ni clientes, que son privados). Por
    // ejemplo, si algún día hay un blog en /blog/[slug]:
    //
    // ...(await db.articulo.findMany({ where: { publicado: true }, select: { slug: true, updatedAt: true } })).map(
    //   (a) => ({ url: `${SITIO}/blog/${a.slug}`, lastModified: a.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })
    // ),
  ];
}
