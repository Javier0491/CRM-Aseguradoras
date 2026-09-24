import "server-only";

import { db } from "@/lib/db";
import { EstadoRecibo, Prisma } from "@/lib/generated/prisma/client";
import { validarAsegurados } from "@/lib/polizas/asegurados";
import { RAMO_DB, seccionesPorRamo, type FormaPago, type Ramo } from "@/lib/polizas/ramos";
import { generarRecibos } from "@/lib/polizas/recibos";
import {
  mesesPorFormaPago,
  normalizarRfc,
  normalizarTelefono,
  parseNumero,
  sanitizarPolizaInput,
  validarPoliza,
  type Errores,
  type Valores,
} from "@/lib/polizas/validacion";

export type GuardarPolizaResultado =
  | {
      ok: true;
      poliza: { id: string; numero: string };
      recibos: number;
      cliente: { nombre: string; nuevo: boolean };
    }
  | { ok: false; error?: string; errores?: Errores };

/** RFC genéricos del SAT: compartidos por muchas personas, no identifican al cliente. */
const RFC_GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Campos específicos del ramo con los numéricos convertidos a number. */
function datosRamo(ramo: Ramo, especificos: Valores): Prisma.InputJsonObject {
  const datos: Record<string, string | number> = {};
  for (const campo of seccionesPorRamo[ramo].flatMap((s) => s.campos)) {
    const v = especificos[campo.name];
    if (!v) continue;
    const numerico = campo.type === "number" || campo.type === "currency" || campo.type === "percent";
    datos[campo.name] = numerico ? parseNumero(v) : v;
  }
  return datos;
}

/**
 * Valida y registra una póliza con su cliente y recibos en una transacción.
 * No verifica sesión: quien la invoque (Server Action) debe hacerlo.
 */
export async function registrarPoliza(raw: unknown): Promise<GuardarPolizaResultado> {
  const input = sanitizarPolizaInput(raw);
  if (!input) return { ok: false, error: "Datos del formulario inválidos." };
  const { ramo, generales: g, especificos, asegurados } = input;

  const aseguradoras = await db.aseguradora.findMany({ select: { id: true } });
  const errores = {
    ...validarPoliza(ramo, g, especificos, aseguradoras.map((a) => a.id)),
    ...validarAsegurados(asegurados),
  };
  if (Object.keys(errores).length > 0) return { ok: false, errores };

  const numeroImpreso = g.numeroImpreso.trim().toUpperCase();
  // Se respeta la póliza vigor validada por el usuario (puede haberla corregido a mano).
  const polizaVigor = g.polizaVigor.trim().toUpperCase();
  const rfc = normalizarRfc(g.rfcCliente);
  const nombre = g.cliente.replace(/\s+/g, " ").trim();
  const recibos = generarRecibos({
    vigenciaInicio: g.vigenciaInicio,
    vigenciaFin: g.vigenciaFin,
    primaTotal: parseNumero(g.primaTotal),
    mesesPorPeriodo: mesesPorFormaPago[g.formaPago as FormaPago],
  });

  try {
    const resultado = await db.$transaction(async (tx) => {
      // 1. Buscar o crear al cliente: por RFC, o por RFC + nombre si el RFC es genérico.
      const existente = await tx.cliente.findFirst({
        where: RFC_GENERICOS.has(rfc)
          ? { rfc, nombre: { equals: nombre, mode: "insensitive" } }
          : { rfc },
        select: { id: true, nombre: true },
      });
      const cliente =
        existente ??
        (await tx.cliente.create({
          data: {
            nombre,
            rfc,
            telefono: normalizarTelefono(g.telefono),
            email: g.email.trim().toLowerCase(),
          },
          select: { id: true, nombre: true },
        }));

      // 2. Crear la póliza con sus recibos (3.) en la misma transacción.
      const poliza = await tx.poliza.create({
        data: {
          numeroImpreso,
          polizaVigor,
          ramo: RAMO_DB[ramo],
          cliente_id: cliente.id,
          aseguradora_id: g.aseguradora,
          vigencia_inicio: fecha(g.vigenciaInicio),
          vigencia_fin: fecha(g.vigenciaFin),
          prima_total: parseNumero(g.primaTotal).toFixed(2),
          forma_pago: g.formaPago as FormaPago,
          datos_ramo: datosRamo(ramo, especificos),
          comision_personalizada_pct: g.comisionPersonalizadaPct
            ? parseNumero(g.comisionPersonalizadaPct).toFixed(2)
            : null,
          asegurados: {
            create: asegurados.map((a, orden) => ({
              orden,
              nombre: a.nombre.replace(/\s+/g, " "),
              parentesco: a.parentesco,
              edad: a.edad ? Number(a.edad) : null,
              sexo: a.sexo || null,
              fecha_nacimiento: a.fecha_nacimiento || null,
              antiguedad: a.antiguedad || null,
            })),
          },
          recibos: {
            create: recibos.map((r) => ({
              numero: r.numero,
              monto: r.monto,
              fecha_vencimiento: fecha(r.fechaVencimiento),
              estado: EstadoRecibo.PENDIENTE,
            })),
          },
        },
        select: { id: true, numeroImpreso: true },
      });

      return { cliente: { nombre: cliente.nombre, nuevo: !existente }, poliza };
    });

    return {
      ok: true,
      poliza: { id: resultado.poliza.id, numero: resultado.poliza.numeroImpreso },
      recibos: recibos.length,
      cliente: resultado.cliente,
    };
  } catch (e) {
    // El único único alcanzable al crear es numeroImpreso.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        errores: { numeroImpreso: `Ya existe una póliza con el número ${numeroImpreso}` },
      };
    }
    console.error("[guardarPoliza]", e);
    return { ok: false, error: "No fue posible guardar la póliza. Inténtalo de nuevo." };
  }
}
