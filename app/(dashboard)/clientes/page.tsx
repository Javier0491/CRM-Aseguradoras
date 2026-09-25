import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, Mail, Phone, SearchX, Users } from "lucide-react";

import { BusquedaUrl } from "@/components/layout/busqueda-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClientesListado, LIMITE_CLIENTES } from "@/lib/clientes/queries";
import { formatNumero } from "@/lib/format";

export const metadata: Metadata = {
  title: "Directorio de Clientes",
};

function SinDato() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const { clientes, total, totalGeneral } = await getClientesListado(q);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Directorio de Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {formatNumero(totalGeneral)} {totalGeneral === 1 ? "cliente registrado" : "clientes registrados"}.
            Se agregan al capturar su primera póliza.
          </p>
        </div>
        <Button asChild>
          <Link href="/captura">
            <FilePlus2 /> Nueva póliza
          </Link>
        </Button>
      </div>

      {totalGeneral === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="size-8 text-primary" />
            <p className="font-medium">Aún no hay clientes registrados</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Captura una póliza y su contratante aparecerá aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <BusquedaUrl
            q={q}
            placeholder="Buscar por nombre, RFC, teléfono o correo"
            etiqueta="Buscar clientes"
          />
          <Card className="gap-0 py-0">
            {clientes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
                <SearchX className="size-7 text-muted-foreground" />
                <p className="font-medium">Ningún cliente coincide con la búsqueda</p>
                <p className="text-sm text-muted-foreground">Prueba con otro nombre, RFC o dato de contacto.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-5">Nombre</TableHead>
                    <TableHead>RFC</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead className="pr-5 text-right">Pólizas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-[280px] pl-5">
                        <p className="truncate font-medium">{c.nombre}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.rfc || <SinDato />}</TableCell>
                      <TableCell>
                        {c.telefono ? (
                          <a
                            href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                            className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary hover:underline"
                          >
                            <Phone className="size-3 text-muted-foreground" />
                            {c.telefono}
                          </a>
                        ) : (
                          <SinDato />
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="inline-flex max-w-full items-center gap-1.5 hover:text-primary hover:underline"
                          >
                            <Mail className="size-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{c.email}</span>
                          </a>
                        ) : (
                          <SinDato />
                        )}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        {c._count.polizas > 0 ? (
                          <Link
                            href={`/polizas?q=${encodeURIComponent(c.rfc || c.nombre)}`}
                            aria-label={`Ver pólizas de ${c.nombre}`}
                          >
                            <Badge variant="secondary" className="tabular-nums hover:bg-primary/15">
                              {formatNumero(c._count.polizas)}
                            </Badge>
                          </Link>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground tabular-nums">
                            0
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {total > clientes.length && (
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                Mostrando {formatNumero(clientes.length)} de {formatNumero(total)} clientes (límite{" "}
                {LIMITE_CLIENTES}). Usa la búsqueda para acotar.
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
