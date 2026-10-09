import type { Metadata } from "next";
import { AlertTriangle, ListTodo, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";

import { AccionesUsuario } from "@/components/usuarios/acciones-usuario";
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
import { getAgenciasParaSuperadmin } from "@/lib/agencias/queries";
import { requireAdmin } from "@/lib/auth/dal";
import { formatFecha } from "@/lib/format";
import { getUsoPlan } from "@/lib/planes/limites";
import { hayCupo, mensajeLimiteUsuarios } from "@/lib/planes/planes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUsuarios } from "@/lib/usuarios/queries";
import { esRolSoloTareas, rolLabels, type RolUsuario } from "@/lib/usuarios/reglas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Usuarios",
};

/** Ícono y color de la insignia de cada rol: administra, opera la cartera o solo usa Tareas. */
const insigniaRol = (rol: RolUsuario): { icono: LucideIcon; clase: string } =>
  rol === "ADMIN"
    ? { icono: ShieldCheck, clase: "border-primary/30 bg-primary/10 text-primary" }
    : esRolSoloTareas(rol)
      ? { icono: ListTodo, clase: "border-success/30 bg-success/10 text-success" }
      : { icono: UserRound, clase: "text-foreground" };

export default async function UsuariosPage() {
  const yo = await requireAdmin();
  const [usuarios, uso] = await Promise.all([getUsuarios(), getUsoPlan(yo.agenciaId)]);
  const sinCupo = !hayCupo(uso.usuarios.usados, uso.usuarios.limite);
  // Solo el SUPERADMIN elige en qué agencia crea la cuenta; el resto crea en la suya.
  const agencias = yo.superadmin
    ? (await getAgenciasParaSuperadmin()).map((a) => ({ id: a.id, nombre: a.nombre }))
    : undefined;
  const disponible = getSupabaseAdmin() !== null;
  const activos = usuarios.filter((u) => u.activo).length;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas del equipo y su nivel de acceso. El Ejecutivo comercial opera la cartera y concilia la cobranza; la
          Ejecutiva de operación, el Líder de oficina y el Auxiliar solo usan Tareas.
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

      {sinCupo && (
        <Alert className="border-warning/30 bg-warning/10 text-warning">
          <AlertTriangle />
          <AlertTitle>Llegaste al límite del plan {uso.nombre}</AlertTitle>
          <AlertDescription className="text-warning/90">
            {mensajeLimiteUsuarios(uso.plan)}
            {yo.superadmin && " Cámbialo en Mis agencias → Cobranza de la plataforma → Configurar."}
          </AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-5 py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Cuentas</CardTitle>
          <CardDescription>
            {uso.usuarios.limite === null
              ? `${activos} ${activos === 1 ? "cuenta activa" : "cuentas activas"}`
              : `${uso.usuarios.usados} de ${uso.usuarios.limite} ${uso.usuarios.limite === 1 ? "cuenta activa" : "cuentas activas"}`}
            {` · plan ${uso.nombre}`}
            {usuarios.length > activos && ` · ${usuarios.length - activos} desactivadas`}
          </CardDescription>
          <CardAction>
            <AgregarUsuario disponible={disponible} agencias={agencias} agenciaActivaId={yo.agenciaId} />
          </CardAction>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Cartera</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead>Último acceso</TableHead>
              <TableHead className="w-14 pr-5">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => {
              const insignia = insigniaRol(u.rol);
              const soloTareas = esRolSoloTareas(u.rol);
              const conPolizas = u._count.polizasAsignadas + u._count.clientesAsignados > 0;
              return (
              <TableRow key={u.id} className={cn(!u.activo && "text-muted-foreground")}>
                <TableCell className="pl-5 font-medium">
                  {u.nombre}
                  {u.id === yo.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(tú)</span>}
                  {!u.activo && (
                    <Badge variant="outline" className="ml-2 border-destructive/30 bg-destructive/10 text-[11px] text-destructive">
                      Desactivada{u.desactivado_at && ` · ${formatFecha(u.desactivado_at)}`}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn("gap-1 font-medium whitespace-nowrap", u.activo ? insignia.clase : "text-muted-foreground")}
                  >
                    <insignia.icono className="size-3" />
                    {rolLabels[u.rol]}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-xs text-muted-foreground tabular-nums",
                    // Pólizas a nombre de quien ya no las ve: hay que reasignarlas.
                    soloTareas && conPolizas && "font-medium text-warning"
                  )}
                  title={soloTareas && conPolizas ? "Con este rol ya no ve su cartera: reasígnala desde el menú." : undefined}
                >
                  {soloTareas && !conPolizas ? (
                    u._count.tareasAsignadas > 0 ? (
                      `${u._count.tareasAsignadas} ${u._count.tareasAsignadas === 1 ? "tarea pendiente" : "tareas pendientes"}`
                    ) : (
                      "Sin pendientes"
                    )
                  ) : (
                    <>
                      {u._count.polizasAsignadas} pól. · {u._count.clientesAsignados} cli.
                      {u._count.tareasAsignadas > 0 && ` · ${u._count.tareasAsignadas} tareas`}
                    </>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{formatFecha(u.created_at)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {u.ultimoAcceso ? formatFecha(u.ultimoAcceso) : "Nunca"}
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <AccionesUsuario
                    usuario={{ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo }}
                    esYo={u.id === yo.id}
                    cartera={{
                      polizas: u._count.polizasAsignadas,
                      clientes: u._count.clientesAsignados,
                      tareas: u._count.tareasAsignadas,
                    }}
                    otros={usuarios
                      .filter((o) => o.activo && o.id !== u.id)
                      .map((o) => ({ id: o.id, nombre: o.nombre, rol: o.rol }))}
                  />
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
