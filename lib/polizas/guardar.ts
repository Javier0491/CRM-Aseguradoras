import "server-only";

import type { UsuarioSesion } from "@/lib/auth/dal";
import { registrarBitacora } from "@/lib/bitacora/registrar";
import { db } from "@/lib/db";
import { EstadoRecibo, Prisma } from "@/lib/generated/prisma/client";
import { validarAsegurados, type AseguradoValores } from "@/lib/polizas/asegurados";
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
  type PolizaInput,
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

export type EditarPolizaResultado =
  | { ok: true; poliza: { id: string; numero: string }; recibosRegenerados: boolean }
  | { ok: false; error?: string; errores?: Errores };

/** RFC genéricos del SAT: compartidos por muchas personas, no identifican al cliente. */
const RFC_GENERICOS = new Set(["XAXX010101000", "XEXX010101000"]);

/**
 * Campos que definen el calendario de recibos. Si la póliza ya tiene recibos cobrados no se
 * pueden cambiar (habría que regenerar recibos que ya están conciliados o pagados).
 */
export const CAMPOS_CALENDARIO = ["vigenciaInicio", "vigenciaFin", "formaPago", "primaTotal"] as const;

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Nombre comparable: sin acentos, mayúsculas, signos ni espacios dobles. */
const claveNombre = (nombre: string) =>
  nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

const aseguradosData = (asegurados: AseguradoValores[]) =>
  asegurados.map((a, orden) => ({
    orden,
    nombre: a.nombre.replace(/\s+/g, " "),
    parentesco: a.parentesco,
    edad: a.edad ? Number(a.edad) : null,
    sexo: a.sexo || null,
    fecha_nacimiento: a.fecha_nacimiento || null,
    antiguedad: a.antiguedad || null,
  }));

const calendario = (g: Valores) =>
  generarRecibos({
    vigenciaInicio: g.vigenciaInicio,
    vigenciaFin: g.vigenciaFin,
    primaTotal: parseNumero(g.primaTotal),
    mesesPorPeriodo: mesesPorFormaPago[g.formaPago as FormaPago],
  });

const recibosData = (g: Valores) =>
  calendario(g).map((r) => ({
    numero: r.numero,
    monto: r.monto,
    fecha_vencimiento: fecha(r.fechaVencimiento),
    estado: EstadoRecibo.PENDIENTE,
  }));

/** Columnas de la póliza que salen del formulario (sin cliente, recibos ni asegurados). */
function columnasPoliza(input: PolizaInput, g: Valores) {
  return {
    numeroImpreso: g.numeroImpreso.trim().toUpperCase(),
    // Se respeta la póliza vigor validada por el usuario (puede haberla corregido a mano).
    polizaVigor: g.polizaVigor.trim().toUpperCase(),
    ramo: RAMO_DB[input.ramo],
    aseguradora_id: g.aseguradora,
    vigencia_inicio: fecha(g.vigenciaInicio),
    vigencia_fin: fecha(g.vigenciaFin),
    prima_total: parseNumero(g.primaTotal).toFixed(2),
    prima_neta: parseNumero(g.primaNeta).toFixed(2),
    forma_pago: g.formaPago as FormaPago,
    datos_ramo: datosRamo(input.ramo, input.especificos),
    sumaAseguradaIlimitada: input.sumaAseguradaIlimitada,
    comision_personalizada_pct: g.comisionPersonalizadaPct
      ? parseNumero(g.comisionPersonalizadaPct).toFixed(2)
      : null,
  };
}

/**
 * Cliente de la póliza: por RFC, o por RFC + nombre si el RFC es genérico. Un bloqueo por
 * cliente (se libera al terminar la transacción) evita que dos capturas simultáneas del mismo
 * RFC lo creen dos veces. Si ya existe, `actualizarContacto` decide si sus datos se reemplazan
 * (edición explícita) o solo se completan los que faltan (captura).
 */
async function obtenerCliente(
  tx: Prisma.TransactionClient,
  agenciaId: string,
  g: Valores,
  { actualizarContacto }: { actualizarContacto: "completar" | "reemplazar" }
) {
  const rfc = normalizarRfc(g.rfcCliente);
  const nombre = g.cliente.replace(/\s+/g, " ").trim();
  const telefono = normalizarTelefono(g.telefono);
  const email = g.email.trim().toLowerCase();
  const generico = RFC_GENERICOS.has(rfc);
  const claveCliente = generico ? `${rfc}|${claveNombre(nombre)}` : rfc;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cliente:${agenciaId}:${claveCliente}`}))`;

  const seleccion = { id: true, nombre: true, telefono: true, email: true } as const;
  const existente = generico
    ? // El nombre se compara sin acentos, mayúsculas ni signos: "HÉCTOR  MORALES" = "Hector Morales".
      (await tx.cliente.findMany({ where: { agenciaId, rfc }, select: seleccion })).find(
        (c) => claveNombre(c.nombre) === claveNombre(nombre)
      )
    : await tx.cliente.findFirst({ where: { agenciaId, rfc }, orderBy: { id: "asc" }, select: seleccion });

  if (!existente) {
    const creado = await tx.cliente.create({
      data: { agenciaId, nombre, rfc, telefono, email },
      select: { id: true, nombre: true },
    });
    return { ...creado, nuevo: true };
  }

  const cambios =
    actualizarContacto === "reemplazar"
      ? {
          ...(existente.nombre !== nombre && { nombre }),
          ...(existente.telefono !== telefono && { telefono }),
          ...(existente.email !== email && { email }),
        }
      : // Expediente maestro: se completan los datos que faltaban, sin sobrescribir.
        {
          ...(!existente.telefono && telefono && { telefono }),
          ...(!existente.email && email && { email }),
        };
  if (Object.keys(cambios).length > 0) {
    await tx.cliente.update({ where: { id: existente.id, agenciaId }, data: cambios });
  }
  return { id: existente.id, nombre: cambios.nombre ?? existente.nombre, nuevo: false };
}

/**
 * Valida el formulario con las mismas reglas que el navegador. Solo acepta aseguradoras de la
 * agencia: una póliza nunca puede apuntar al catálogo de otra.
 */
async function validarFormulario(agenciaId: string, input: PolizaInput, g: Valores): Promise<Errores> {
  const aseguradoras = await db.aseguradora.findMany({ where: { agenciaId }, select: { id: true } });
  return {
    ...validarPoliza(input.ramo, g, input.especificos, aseguradoras.map((a) => a.id), input.sumaAseguradaIlimitada),
    ...validarAsegurados(input.asegurados),
  };
}

function errorGuardado(e: unknown, numeroImpreso: string, contexto: string) {
  // El único único alcanzable es numeroImpreso.
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false as const, errores: { numeroImpreso: `Ya existe una póliza con el número ${numeroImpreso}` } };
  }
  console.error(`[${contexto}]`, e);
  return { ok: false as const, error: "No fue posible guardar la póliza. Inténtalo de nuevo." };
}

/**
 * Valida y registra una póliza con su cliente y recibos en una transacción.
 * No verifica sesión: quien la invoque (Server Action) debe hacerlo. Sin `permitirComision`
 * (rol EJECUTIVO) el % personalizado se descarta y la póliza usa la matriz de comisiones.
 * Con `renuevaA` es la renovación de esa póliza: se fuerza su póliza vigor para mantener la
 * cadena (y con ella el año de la póliza para la matriz de comisiones).
 */
export async function registrarPoliza(
  raw: unknown,
  {
    permitirComision,
    usuario,
    renuevaA,
  }: { permitirComision: boolean; usuario: UsuarioSesion; renuevaA?: string }
): Promise<GuardarPolizaResultado> {
  const input = sanitizarPolizaInput(raw);
  if (!input) return { ok: false, error: "Datos del formulario inválidos." };
  let g = permitirComision ? input.generales : { ...input.generales, comisionPersonalizadaPct: "" };
  const { agenciaId } = usuario;

  // Renovación: misma aseguradora, misma póliza vigor e inicio posterior a la vigencia anterior.
  let anterior: { id: string; numeroImpreso: string } | null = null;
  if (renuevaA !== undefined) {
    if (typeof renuevaA !== "string" || !/^[a-z0-9]+$/i.test(renuevaA)) return { ok: false, error: "Datos inválidos." };
    const original = await db.poliza.findUnique({
      where: { id: renuevaA, agenciaId },
      select: {
        id: true,
        numeroImpreso: true,
        polizaVigor: true,
        aseguradora_id: true,
        vigencia_inicio: true,
        vigencia_fin: true,
        aseguradora: { select: { nombre: true } },
      },
    });
    if (!original) return { ok: false, error: "La póliza que se renueva ya no existe." };
    const yaRenovada = original.polizaVigor
      ? await db.poliza.findFirst({
          where: {
            agenciaId,
            polizaVigor: original.polizaVigor,
            aseguradora_id: original.aseguradora_id,
            vigencia_inicio: { gte: original.vigencia_fin },
          },
          select: { numeroImpreso: true },
        })
      : null;
    if (yaRenovada) {
      return { ok: false, error: `La póliza ${original.numeroImpreso} ya se renovó con la ${yaRenovada.numeroImpreso}.` };
    }
    if (g.aseguradora !== original.aseguradora_id) {
      return { ok: false, errores: { aseguradora: `La renovación debe ser con ${original.aseguradora.nombre}.` } };
    }
    if (g.vigenciaInicio && g.vigenciaInicio <= iso(original.vigencia_inicio)) {
      return {
        ok: false,
        errores: { vigenciaInicio: `Debe iniciar después de la vigencia anterior (${iso(original.vigencia_inicio)}).` },
      };
    }
    if (original.polizaVigor) g = { ...g, polizaVigor: original.polizaVigor };
    anterior = { id: original.id, numeroImpreso: original.numeroImpreso };
  }

  const errores = await validarFormulario(agenciaId, input, g);
  if (Object.keys(errores).length > 0) return { ok: false, errores };
  const datos = columnasPoliza(input, g);
  const recibos = recibosData(g);

  try {
    const resultado = await db.$transaction(async (tx) => {
      const cliente = await obtenerCliente(tx, agenciaId, g, { actualizarContacto: "completar" });
      const poliza = await tx.poliza.create({
        data: {
          ...datos,
          agenciaId,
          cliente_id: cliente.id,
          asegurados: { create: aseguradosData(input.asegurados).map((a) => ({ ...a, agenciaId })) },
          recibos: { create: recibos.map((r) => ({ ...r, agenciaId })) },
        },
        select: { id: true, numeroImpreso: true },
      });
      await registrarBitacora(
        usuario,
        anterior
          ? {
              accion: "poliza.renovar",
              entidad: "poliza",
              entidadId: poliza.id,
              descripcion: `Renovó la póliza ${anterior.numeroImpreso} con la ${poliza.numeroImpreso} (${cliente.nombre})`,
              datos: { renuevaA: anterior.id },
            }
          : {
              accion: "poliza.crear",
              entidad: "poliza",
              entidadId: poliza.id,
              descripcion: `Capturó la póliza ${poliza.numeroImpreso} de ${cliente.nombre} con ${recibos.length} ${recibos.length === 1 ? "recibo" : "recibos"}`,
            },
        tx
      );
      return { cliente: { nombre: cliente.nombre, nuevo: cliente.nuevo }, poliza };
    });

    return {
      ok: true,
      poliza: { id: resultado.poliza.id, numero: resultado.poliza.numeroImpreso },
      recibos: recibos.length,
      cliente: resultado.cliente,
    };
  } catch (e) {
    return errorGuardado(e, datos.numeroImpreso, "guardarPoliza");
  }
}

const ETIQUETAS_CAMBIO: Record<string, string> = {
  numeroImpreso: "número",
  polizaVigor: "póliza vigor",
  ramo: "ramo",
  aseguradora_id: "aseguradora",
  vigencia_inicio: "inicio de vigencia",
  vigencia_fin: "fin de vigencia",
  prima_total: "prima total",
  prima_neta: "prima neta",
  forma_pago: "forma de pago",
  sumaAseguradaIlimitada: "suma ilimitada",
  comision_personalizada_pct: "comisión personalizada",
  datos_ramo: "datos del ramo",
  cliente_id: "cliente",
};

/** Valor normalizado para detectar cambios: fechas ISO, números sin ceros de más y JSON con claves ordenadas. */
function comparable(v: unknown): string {
  if (v instanceof Date) return iso(v);
  if (v === null || v === undefined) return "";
  // Los montos de Prisma llegan como Decimal: se comparan por su valor numérico.
  if (Prisma.Decimal.isDecimal(v)) return String(Number(v));
  if (typeof v === "object") return JSON.stringify(v, Object.keys(v as object).sort());
  const n = Number(v);
  return typeof v === "boolean" || Number.isNaN(n) || String(v).trim() === "" ? String(v) : String(n);
}

/**
 * Corrige una póliza capturada. Si no tiene recibos cobrados y cambia su calendario (vigencia,
 * forma de pago o prima total), los recibos se regeneran; si ya tiene recibos pagados o
 * conciliados, esos campos no se pueden cambiar (primero hay que revertir su conciliación).
 * Los datos del contratante editados aquí actualizan el expediente del cliente.
 */
export async function actualizarPoliza(
  polizaId: string,
  raw: unknown,
  { permitirComision, usuario }: { permitirComision: boolean; usuario: UsuarioSesion }
): Promise<EditarPolizaResultado> {
  if (typeof polizaId !== "string" || !/^[a-z0-9]+$/i.test(polizaId)) return { ok: false, error: "Datos inválidos." };
  const input = sanitizarPolizaInput(raw);
  if (!input) return { ok: false, error: "Datos del formulario inválidos." };
  const { agenciaId } = usuario;

  const actual = await db.poliza.findUnique({
    where: { id: polizaId, agenciaId },
    select: {
      numeroImpreso: true,
      polizaVigor: true,
      ramo: true,
      aseguradora_id: true,
      vigencia_inicio: true,
      vigencia_fin: true,
      prima_total: true,
      prima_neta: true,
      forma_pago: true,
      sumaAseguradaIlimitada: true,
      comision_personalizada_pct: true,
      datos_ramo: true,
      cliente_id: true,
      recibos: { select: { estado: true, auto_creado: true } },
    },
  });
  if (!actual) return { ok: false, error: "La póliza ya no existe." };

  // Un ejecutivo no ve ni cambia el % personalizado: se conserva el que tenía.
  const g: Valores = permitirComision
    ? input.generales
    : {
        ...input.generales,
        comisionPersonalizadaPct:
          actual.comision_personalizada_pct === null ? "" : Number(actual.comision_personalizada_pct).toFixed(2),
      };
  const errores = await validarFormulario(agenciaId, input, g);
  if (Object.keys(errores).length > 0) return { ok: false, errores };

  const datos = columnasPoliza(input, g);
  const cambiaCalendario =
    iso(actual.vigencia_inicio) !== g.vigenciaInicio ||
    iso(actual.vigencia_fin) !== g.vigenciaFin ||
    actual.forma_pago !== g.formaPago ||
    Number(actual.prima_total) !== parseNumero(g.primaTotal);
  const conCobros = actual.recibos.some((r) => r.estado !== "PENDIENTE" || r.auto_creado);
  if (cambiaCalendario && conCobros) {
    const mensaje = "La póliza ya tiene recibos cobrados: revierte primero su conciliación para cambiarlo.";
    return {
      ok: false,
      error: "No se puede cambiar la vigencia, la forma de pago ni la prima total de una póliza con recibos cobrados.",
      errores: Object.fromEntries(
        CAMPOS_CALENDARIO.filter((c) => {
          if (c === "vigenciaInicio") return iso(actual.vigencia_inicio) !== g.vigenciaInicio;
          if (c === "vigenciaFin") return iso(actual.vigencia_fin) !== g.vigenciaFin;
          if (c === "formaPago") return actual.forma_pago !== g.formaPago;
          return Number(actual.prima_total) !== parseNumero(g.primaTotal);
        }).map((c) => [c, mensaje])
      ),
    };
  }

  try {
    await db.$transaction(async (tx) => {
      const cliente = await obtenerCliente(tx, agenciaId, g, { actualizarContacto: "reemplazar" });
      const nuevo = { ...datos, cliente_id: cliente.id };
      await tx.poliza.update({ where: { id: polizaId, agenciaId }, data: nuevo });
      await tx.asegurado.deleteMany({ where: { agenciaId, poliza_id: polizaId } });
      if (input.asegurados.length > 0) {
        await tx.asegurado.createMany({
          data: aseguradosData(input.asegurados).map((a) => ({ ...a, agenciaId, poliza_id: polizaId })),
        });
      }
      if (cambiaCalendario) {
        // Sin cobros todos los recibos siguen pendientes: se rehace el calendario completo.
        await tx.recibo.deleteMany({ where: { agenciaId, poliza_id: polizaId } });
        await tx.recibo.createMany({ data: recibosData(g).map((r) => ({ ...r, agenciaId, poliza_id: polizaId })) });
      }

      const cambios = Object.keys(ETIQUETAS_CAMBIO).filter(
        (k) => comparable(actual[k as keyof typeof actual]) !== comparable(nuevo[k as keyof typeof nuevo])
      );
      await registrarBitacora(
        usuario,
        {
          accion: "poliza.editar",
          entidad: "poliza",
          entidadId: polizaId,
          descripcion:
            `Editó la póliza ${datos.numeroImpreso}` +
            (cambios.length ? `: ${cambios.map((k) => ETIQUETAS_CAMBIO[k]).join(", ")}` : " (asegurados o contratante)") +
            (cambiaCalendario ? "; se regeneraron los recibos" : ""),
          datos: {
            antes: Object.fromEntries(cambios.map((k) => [k, comparable(actual[k as keyof typeof actual])])),
            despues: Object.fromEntries(cambios.map((k) => [k, comparable(nuevo[k as keyof typeof nuevo])])),
          },
        },
        tx
      );
    });
  } catch (e) {
    return errorGuardado(e, datos.numeroImpreso, "actualizarPoliza");
  }
  return { ok: true, poliza: { id: polizaId, numero: datos.numeroImpreso }, recibosRegenerados: cambiaCalendario };
}
