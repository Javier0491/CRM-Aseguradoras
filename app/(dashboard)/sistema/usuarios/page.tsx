import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck, UserRound } from "lucide-react";

import { AgregarUsuario } from "@/components/usuarios/agregar-usuario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/dal";
import { formatFecha } from "@/lib/format";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarios } from "@/lib/usuarios/queries";
import { rolLabels } from "@/lib/usuarios/reglas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Usuarios",
};

export default async function UsuariosPage() {
  const yo = await requireAdmin();
  const usuarios = await getUsuarios();
  const disponible = getSupabaseAdmin() !== null;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas del equipo y su nivel de acceso. Los ejecutivos no ven comisiones, conciliación ni
          configuración.
        </p>
      </div>

      {!disponible && (
        <Alert className="border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle />
          <AlertTitle>Creación de cuentas no configurada</AlertTitle>
          <AlertDescription className="text-warning/90">
            Agrega SUPABASE_SECRET_KEY (Supabase → Project Settings → API Keys → Secret keys) a las
            variables de entorno del servidor.
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Cuentas</CardTitle>
          <CardDescription>
            {usuarios.length} {usuarios.length === 1 ? "cuenta" : "cuentas"}
          </CardDescription>
          <CardAction>
            <AgregarUsuario disponible={disponible} />
          </CardAction>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="pr-5">Último acceso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-5 font-medium">
                  {u.nombre}
                  {u.id === yo.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 font-medium",
                      u.rol === "ADMIN" ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground"
                    )}
                  >
                    {u.rol === "ADMIN" ? <ShieldCheck className="size-3" /> : <UserRound className="size-3" />}
                    {rolLabels[u.rol]}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{formatFecha(u.created_at)}</TableCell>
                <TableCell className="pr-5 tabular-nums text-muted-foreground">
                  {u.ultimoAcceso ? formatFecha(u.ultimoAcceso) : "Nunca"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
