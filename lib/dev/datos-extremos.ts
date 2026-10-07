// Datos de prueba de la galería de desarrollo (/dev/datos-extremos). Tienen la forma exacta que
// entregan las consultas de cada pantalla y entran por la misma puerta (las props de su vista):
// un caso normal ("demo"), el peor caso realista (razones sociales y nombres largos, correos sin
// espacios, montos enormes, todos los estados a la vez), vacío, uno y masivo. Los límites salen
// de las validaciones: nombre del cliente 200 (500 desde la captura), dirección 300, nota de
// renovación 300, título de tarea 140, seguimiento 2,000, asegurados 200, listados 200, embudo 500.
// Solo para desarrollo: nada de esto lee ni escribe la base.
import "server-only";

import type { DatosCliente } from "@/components/clientes/vista-cliente";
import type { DatosDashboard } from "@/components/dashboard/vista-dashboard";
import type { DatosPoliza } from "@/components/polizas/vista-poliza";
import type { DatosPolizas } from "@/components/polizas/vista-polizas";
import type { DatosRenovaciones } from "@/components/renovaciones/vista-renovaciones";
import type { DatosSuperadmin } from "@/components/superadmin/vista-superadmin";
import type { DatosTareas } from "@/components/tareas/vista-tareas";
import { hoyISO } from "@/lib/format";
import { Prisma, type EstadoRecibo, type FormaPago, type Ramo } from "@/lib/generated/prisma/client";
import { estadoCobro } from "@/lib/plataforma/cobranza";
import { COLUMNAS_EMBUDO, columnaDe, type ColumnaEmbudo } from "@/lib/renovaciones/reglas";
import { MAX_RESPONSABLES_TAREA } from "@/lib/tareas/reglas";
import type { RolUsuario } from "@/lib/usuarios/reglas";

export const CONJUNTOS = [
  { clave: "demo", titulo: "Demo" },
  { clave: "extremos", titulo: "Peor caso" },
  { clave: "vacio", titulo: "Vacío" },
  { clave: "uno", titulo: "Uno" },
  { clave: "masivo", titulo: "Masivo" },
] as const;
export type Conjunto = (typeof CONJUNTOS)[number]["clave"];
export const esConjunto = (v: unknown): v is Conjunto => CONJUNTOS.some((c) => c.clave === v);

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────

const DIA = 86_400_000;
/** Medianoche UTC a `n` días de hoy (negativo = en el pasado). */
const dia = (n: number) => new Date(Date.parse(`${hoyISO()}T00:00:00Z`) + n * DIA);
const isoDia = (n: number) => dia(n).toISOString().slice(0, 10);
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
/** Elemento `i` de una lista, en ciclo. */
const ciclo = <T>(lista: readonly T[], i: number): T => lista[i % lista.length];
const rango = (n: number) => Array.from({ length: n }, (_, i) => i);

// ── Catálogo de valores ───────────────────────────────────────────────────────────────────────

const CLIENTES_DEMO = ["Juan Pérez García", "Comercializadora del Centro, S.A. de C.V.", "Ana Lucía Torres Medina"];
// Reales en México: fideicomisos y sociedades con su régimen completo, mayúsculas de la carátula
// (la captura con IA las respeta), nombres muy cortos, compuestos, con & y con diacríticos.
const CLIENTES_EXTREMOS = [
  "Fideicomiso Irrevocable de Administración y Fuente de Pago F/4521 celebrado con Banco Mercantil del Norte, S.A., Institución de Banca Múltiple, Grupo Financiero Banorte",
  "TRANSPORTES Y LOGÍSTICA INTEGRAL DEL NORESTE DE MÉXICO, S.A.P.I. DE C.V.",
  "Ana",
  "María Guadalupe del Socorro Hernández-Villaseñor de la Fuente",
  "Hernández & Asociados Despacho Jurídico, S.C.",
  "Nguyễn Thị Ngọc Hân",
  "Asociación de Colonos del Fraccionamiento Residencial Bosques de las Lomas, A.C.",
  "José Ángel Núñez Ibáñez",
];
const CORREOS_EXTREMOS = [
  "facturacion.proveedores.corporativo@transportesylogisticaintegraldelnoreste.example.com",
  "",
  "a@b.test",
  "maria.guadalupe.hernandez.villasenor+renovaciones2026@example.com",
  "contacto@example.com",
  "ngoc.han@example.com",
  "administracion.colonos.bosquesdelaslomas@example.org",
  "",
];
const TELEFONOS_EXTREMOS = ["8112345678", "", "5512345678", "", "3398765432", "5544332211", "", "8187654321"];
const RFCS = ["FIA210512AB3", "TLI0503151Q2", "TOMA850101AB1", "HEVG7203157K9", "HAD101010XY4", "XAXX010101000", "ACF950620LL2", "NUIJ800229HD1"];

const ASEGURADORAS_DEMO = [
  { nombre: "AXA Seguros", color_hex: "#00008F" },
  { nombre: "GNP", color_hex: "#FF6B00" },
  { nombre: "MetLife", color_hex: "#0090DA" },
];
// Nombre largo, de tres letras, color blanco (invisible en claro), azul marino (invisible en
// oscuro) y sin color.
const ASEGURADORAS_EXTREMAS = [
  { nombre: "Plan Seguro, S.A. de C.V., Compañía de Seguros", color_hex: "#0B5FFF" },
  { nombre: "GNP", color_hex: "#FF6B00" },
  { nombre: "Seguros Monterrey New York Life", color_hex: "#FFFFFF" },
  { nombre: "Qualitas Compañía de Seguros, S.A. de C.V.", color_hex: "" },
  { nombre: "AXA Seguros", color_hex: "#00008F" },
];
const EJECUTIVOS_DEMO = ["Laura Méndez", "Carlos Ruiz"];
const EJECUTIVOS_EXTREMOS: (string | null)[] = ["María Guadalupe Hernández de la Fuente Villarreal", "Luis", null];

const NUMEROS_DEMO = ["0012345678", "TSB4521873", "1503221"];
const NUMEROS_EXTREMOS = ["DAN-IND-2026-000123456-REN-03-ANEXO-B", "TSB1234567890123456789", "1", "0012345678", "GMMC/2026/000987654/REN-12"];

const PRIMAS_DEMO = [18_540.32, 7_250, 125_300.5];
// Daños industriales, flotilla, accidentes escolares, GMM colectivo de una empresa grande.
const PRIMAS_EXTREMAS = [187_654_321.09, 1_234_567.89, 350, 48_750_320.55, 9_999.99];

const RAMOS: Ramo[] = ["DANOS", "AUTOS", "OTROS", "GMM_COLECTIVO", "VIDA_GRUPO", "GMM_INDIVIDUAL", "RC_PROFESIONAL", "HOGAR", "VIDA_INDIVIDUAL"];
const FORMAS: FormaPago[] = ["MENSUAL", "ANUAL", "TRIMESTRAL", "SEMESTRAL"];
const ESTADOS_RECIBO: EstadoRecibo[] = ["CONCILIADO", "PAGADO", "PENDIENTE", "PENDIENTE", "CANCELADO"];

const NOTA_PERDIDA =
  "Se fue con otro agente · El cliente comentó que su nuevo agente le ofreció 15% de descuento en la flotilla completa y además le incluyeron asistencia vial sin costo para los 48 vehículos; pidió que lo busquemos el próximo año con una propuesta que iguale esas condiciones.";
const TITULO_TAREA_LARGO =
  "Llamar al área de recursos humanos para confirmar el alta de los 37 empleados nuevos en el censo antes del corte de la aseguradora y enviar…";
const TEXTO_LARGO =
  "Reunión con el director de finanzas y la gerente de recursos humanos. Acordamos:\n1) enviar la cotización de renovación con tres alternativas de deducible;\n2) revisar el siniestro 2026-000451 que sigue en proceso con la aseguradora;\n3) agregar la cobertura de maternidad para las 112 colaboradoras.\nDocumentos en https://drive.example.com/drive/folders/1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ?usp=sharing para que el equipo los consulte.";

type Fila = "demo" | "extremos";
const cliente = (f: Fila, i: number) => (f === "demo" ? ciclo(CLIENTES_DEMO, i) : ciclo(CLIENTES_EXTREMOS, i));
const aseguradora = (f: Fila, i: number) => (f === "demo" ? ciclo(ASEGURADORAS_DEMO, i) : ciclo(ASEGURADORAS_EXTREMAS, i));
const ejecutivo = (f: Fila, i: number) => {
  const nombre = f === "demo" ? ciclo(EJECUTIVOS_DEMO, i) : ciclo(EJECUTIVOS_EXTREMOS, i);
  return nombre === null ? null : { id: `usr${i % 3}`, nombre };
};
const numero = (f: Fila, i: number) => (f === "demo" ? ciclo(NUMEROS_DEMO, i) : ciclo(NUMEROS_EXTREMOS, i)) + (i >= 5 ? `-${i}` : "");
const prima = (f: Fila, i: number) => (f === "demo" ? ciclo(PRIMAS_DEMO, i) : ciclo(PRIMAS_EXTREMAS, i));
const correo = (f: Fila, i: number) => (f === "demo" ? "contacto@example.com" : ciclo(CORREOS_EXTREMOS, i));
const telefono = (f: Fila, i: number) => (f === "demo" ? "5512345678" : ciclo(TELEFONOS_EXTREMOS, i));

const ejecutivosOpciones = (c: Conjunto) =>
  c === "demo"
    ? EJECUTIVOS_DEMO.map((nombre, i) => ({ id: `usr${i}`, nombre }))
    : EJECUTIVOS_EXTREMOS.flatMap((nombre, i) => (nombre ? [{ id: `usr${i}`, nombre }] : []));

// Equipo para encargar tareas: nombres y apellidos reales combinados (de "Jo" a cuatro palabras).
const NOMBRES_EQUIPO = ["Ana Sofía", "Jo", "José Francisco Javier", "Fernanda Ximena", "Raúl", "Itzel Citlali"];
const APELLIDOS_EQUIPO = ["Rodríguez", "Martínez Ochoa", "Gutiérrez Zamudio", "Peña", "Hernández de la Fuente Villarreal", "Ramírez"];
const ROLES_EQUIPO: RolUsuario[] = ["ADMIN", "EJECUTIVO", "OPERACION", "LIDER_OFICINA", "AUXILIAR"];

/** Todo el equipo (con su rol): el de la demo, ocho personas en el peor caso y 24 en el masivo. */
const equipoOpciones = (c: Conjunto) => {
  const extra = { demo: 1, extremos: 6, vacio: 0, uno: 0, masivo: 22 }[c];
  return [
    ...ejecutivosOpciones(c),
    ...rango(extra).map((i) => ({
      id: `eq${i}`,
      nombre: `${ciclo(NOMBRES_EQUIPO, i)} ${APELLIDOS_EQUIPO[(i + Math.floor(i / NOMBRES_EQUIPO.length)) % APELLIDOS_EQUIPO.length]}`,
    })),
  ].map((e, i) => ({ ...e, rol: ciclo(ROLES_EQUIPO, i) }));
};

/** Encargados de una tarea: ninguno, uno, varios a medias y el máximo (20), con su parte hecha o no. */
function encargados(c: Conjunto, i: number) {
  const equipo = equipoOpciones(c);
  const n = c === "demo" ? ciclo([1, 2, 3], i) : ciclo([0, 1, 3, MAX_RESPONSABLES_TAREA], i);
  return equipo.slice(0, n).map((e, j) => ({
    usuarioId: e.id,
    completadaAt: (i + j) % 3 === 1 ? dia(-1) : null,
    usuario: { nombre: e.nombre },
  }));
}

/** Tareas con título y nota largos, vencidas, de hoy y completadas. */
function tareas(c: Conjunto, n: number) {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  return rango(n).map((i) => {
    const responsables = encargados(c, i);
    // Como en el servidor: con encargados, la tarea queda hecha cuando todos terminan su parte.
    const hecha = responsables.length > 0 ? responsables.every((r) => r.completadaAt !== null) : i % 4 === 3;
    return {
      id: `tar${i}`,
      titulo: f === "demo" ? ciclo(["Llamar por la renovación", "Enviar cotización"], i) : ciclo([TITULO_TAREA_LARGO, "Ok", "Revisar siniestro 2026-000451"], i),
      descripcion: f === "demo" ? null : ciclo([TEXTO_LARGO, null, "Pedir factura"], i),
      vence: dia(ciclo([-12, 0, 3], i)),
      completadaAt: hecha ? dia(-1) : null,
      completadaPorEmail: null,
      creadaPorEmail: "laura.mendez@example.com",
      responsables,
      cliente: { id: `cli${i}`, nombre: cliente(f, i) },
      poliza: i % 2 === 0 ? { id: `pol${i}`, numeroImpreso: numero(f, i) } : null,
    };
  });
}

// ── Pólizas y recibos ─────────────────────────────────────────────────────────────────────────

function polizaListado(f: Fila, i: number): DatosPolizas["listado"]["polizas"][number] {
  const ramo = ciclo(RAMOS, i);
  const recibos = f === "demo" ? 4 : ciclo([12, 1, 0, 24, 4], i);
  return {
    id: `pol${i}`,
    numeroImpreso: numero(f, i),
    polizaVigor: f === "extremos" && i % 2 === 1 ? "0012345678000100REN2026" : null,
    caratula_path: i % 2 === 0 ? "x" : null,
    negociacion_path: null,
    expediente_path: i % 3 === 0 ? "x" : null,
    ramo,
    vigencia_inicio: dia(-300 + i),
    vigencia_fin: dia(ciclo([65, 12, -3, 0, 400], i)),
    prima_total: dec(prima(f, i)),
    forma_pago: ciclo(FORMAS, i),
    created_at: dia(-300 + i),
    canceladaAt: f === "extremos" && i % 5 === 1 ? dia(-20) : null,
    ejecutivo: ejecutivo(f, i),
    cliente: { nombre: cliente(f, i), rfc: ciclo(RFCS, i), telefono: telefono(f, i), email: correo(f, i) },
    aseguradora: aseguradora(f, i),
    recibos: rango(recibos).map((r) => ({ estado: ciclo(ESTADOS_RECIBO, r + i) })),
    asegurados: ramo === "GMM_COLECTIVO" ? [] : [{ nombre: f === "demo" ? "Juan Pérez García" : ciclo(CLIENTES_EXTREMOS, i + 3) }],
    _count: { asegurados: ramo === "GMM_COLECTIVO" ? 0 : f === "demo" ? 3 : ciclo([4_812, 1, 0, 200], i) },
  };
}

function reciboListado(f: Fila, i: number): DatosPolizas["listadoRecibos"]["recibos"][number] {
  return {
    id: `rec${i}`,
    numero: (i % 12) + 1,
    monto: dec(f === "demo" ? 1_545.03 : ciclo([46_913_580.27, 29.17, 102_884.16], i)),
    fecha_vencimiento: dia(ciclo([-40, -5, 0, 6, 30], i)),
    estado: ciclo(["PENDIENTE", "PENDIENTE", "PAGADO", "CONCILIADO", "CANCELADO"] as const, i),
    poliza: {
      id: `pol${i}`,
      numeroImpreso: numero(f, i),
      _count: { recibos: f === "demo" ? 12 : ciclo([360, 12, 1], i) },
      cliente: { nombre: cliente(f, i) },
      aseguradora: { ...aseguradora(f, i), diasGracia: ciclo([30, 0, 120], i) },
    },
  };
}

export function datosPolizas(c: Conjunto, pestana: DatosPolizas["filtros"]["pestana"] = "polizas"): DatosPolizas {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  const n = { demo: 3, extremos: 8, vacio: 0, uno: 1, masivo: 200 }[c];
  const total = { demo: 3, extremos: 1_284, vacio: 0, uno: 1, masivo: 12_483 }[c];
  const polizas = rango(n).map((i) => polizaListado(f, i));
  const recibos = rango(Math.min(n * 2, 200)).map((i) => reciboListado(f, i));
  const asegInfo = (i: number) => ({ nombre: aseguradora(f, i).nombre, color_hex: aseguradora(f, i).color_hex });
  return {
    listado: {
      polizas,
      total,
      totalGeneral: total,
      porVencer: { demo: 1, extremos: 1_284, vacio: 0, uno: 1, masivo: 3_107 }[c],
      faltaContacto: { demo: 0, extremos: 311, vacio: 0, uno: 1, masivo: 2_045 }[c],
      canceladas: { demo: 0, extremos: 211, vacio: 0, uno: 1, masivo: 1_190 }[c],
    },
    listadoRecibos: {
      recibos,
      total: { demo: 6, extremos: 12_483, vacio: 0, uno: 2, masivo: 148_920 }[c],
      pendientes: {
        cantidad: { demo: 2, extremos: 9_876, vacio: 0, uno: 1, masivo: 98_765 }[c],
        monto: { demo: 3_090.06, extremos: 1_234_567_890.12, vacio: 0, uno: 1_545.03, masivo: 98_765_432_109.87 }[c],
      },
    },
    conciliacion: {
      conciliadas: rango(Math.min(n, 50)).map((i) => ({
        id: `pol${i}`,
        numeroImpreso: numero(f, i),
        cliente: cliente(f, i),
        ramo: ciclo(RAMOS, i),
        aseguradora: asegInfo(i),
        conciliados: ciclo([1, 11, 360], i),
        recibos: ciclo([1, 12, 360], i),
        ultimaConciliacion: i % 3 === 2 ? null : dia(-i),
      })),
      sinConciliar: rango(Math.min(n, 50)).map((i) => ({
        id: `pol${i}`,
        numeroImpreso: numero(f, i),
        polizaVigor: i % 2 ? "0012345678000100REN2026" : null,
        cliente: cliente(f, i),
        rfc: ciclo(RFCS, i),
        ramo: ciclo(RAMOS, i),
        aseguradora: asegInfo(i),
        vigenciaInicio: dia(-200),
        vigenciaFin: dia(165),
        recibos: ciclo([1, 12, 360], i),
        motivo: ciclo(
          [
            { tipo: "numero_distinto" as const, texto: "En el estado de cuenta aparece con otro número: «GMMC2026000987654REN12ANEXOB»; revisa si se capturó mal." },
            { tipo: "sin_estado_cuenta" as const, texto: "Aún no se sube un estado de cuenta de esta aseguradora." },
          ],
          i
        ),
        numeroEnArchivo: i % 2 === 0 ? "GMMC2026000987654REN12ANEXOB" : null,
      })),
      noEncontradas: rango(Math.min(n, 30)).map((i) => ({
        aseguradora: asegInfo(i),
        polizaArchivo: ciclo(["GMMC2026000987654REN12ANEXOB", "77"], i),
        archivo: "Estado_de_cuenta_comisiones_PLAN_SEGURO_septiembre_2026_version_corregida_final.xlsx",
        fila: 1_284 + i,
        fecha: dia(-15),
        veces: ciclo([1, 12], i),
        comisionPagada: ciclo([98_765_432.1, 0.01], i),
        estado: { tipo: "no_registrada" as const, texto: "La póliza no está registrada en el CRM con esta aseguradora: captúrala." },
        poliza: i % 2 ? { id: `pol${i}`, numeroImpreso: numero(f, i) } : null,
      })),
    },
    ejecutivos: ejecutivosOpciones(c),
    filtros: { q: "", soloFaltaContacto: false, ejecutivo: "", estatus: "", filtroRecibos: "todos", pestana },
    usuario: { id: "usr0", soloSuCartera: false, verComisiones: true },
    hoy: hoyISO(),
  };
}

// ── Expediente de la póliza ───────────────────────────────────────────────────────────────────

const NOMBRE_ARCHIVO_LARGO = "Caratula_Poliza_VIDA_GRUPO_2026_FIDEICOMISO_F4521_BANORTE_version_final_firmada_(2).pdf";

export function datosPoliza(c: Conjunto): DatosPoliza {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  const extremo = c === "extremos" || c === "masivo";
  const nRecibos = { demo: 4, extremos: 12, vacio: 4, uno: 1, masivo: 360 }[c];
  const nAsegurados = { demo: 3, extremos: 8, vacio: 0, uno: 1, masivo: 200 }[c];
  const nEndosos = { demo: 1, extremos: 3, vacio: 0, uno: 1, masivo: 40 }[c];
  const nHistorial = { demo: 3, extremos: 6, vacio: 0, uno: 1, masivo: 100 }[c];
  const primaTotal = f === "demo" ? 18_540.32 : 12_345_678.9;
  const conArchivos = c !== "vacio";
  return {
    poliza: {
      id: "pol0",
      numeroImpreso: f === "demo" ? "0012345678" : "VG-COL-2026-000123456-REN-03-ANEXO-B",
      polizaVigor: c === "vacio" ? null : f === "demo" ? "0012345678" : "VGCOL2026000123456REN03ANEXOB",
      aseguradora_id: "ase0",
      ramo: f === "demo" ? "GMM_INDIVIDUAL" : "VIDA_GRUPO",
      vigencia_inicio: dia(-340),
      vigencia_fin: dia(c === "masivo" ? 10_590 : 25),
      prima_total: dec(primaTotal),
      prima_neta: c === "vacio" ? null : dec(primaTotal * 0.82),
      forma_pago: c === "masivo" || c === "extremos" ? "MENSUAL" : "TRIMESTRAL",
      created_at: dia(-340),
      comision_personalizada_pct: extremo ? dec(12.75) : null,
      datos_ramo:
        f === "demo"
          ? { sumaAseguradaValor: "5000000", sumaAseguradaUnidad: "MXN", deducibleValor: "15000", deducibleUnidad: "MXN", coaseguro: "10", otrasCoberturas: "Emergencia en el extranjero, Maternidad" }
          : c === "vacio"
            ? {}
            : {
                numeroAsegurados: "4812",
                reglaSuma: "Múltiplo de sueldo",
                sumaAsegurada: "999999999.99",
                moneda: "UDIS",
                coberturasAdicionales:
                  "Invalidez total y permanente, Muerte accidental, Pérdidas orgánicas escala B, Gastos funerarios, Anticipo por enfermedad terminal, Exención de pago de primas por invalidez, Doble indemnización por muerte accidental en transporte público, Seguro de sobrevivencia, Cáncer, Ayuda para gastos de sepelio de cónyuge e hijos, Beneficio por incapacidad temporal, Asistencia",
                // Campos de una versión anterior del formulario: se muestran en "Otros datos".
                agenteAnteriorClave: "AGTE-000451-NORESTE-OFICINA-CENTRAL-MONTERREY",
                observacionesDeLaCaptura:
                  "La carátula original indica que la suma asegurada se calcula como 36 meses de sueldo base mensual integrado con tope de 2,000 UMAM por asegurado; los empleados de confianza tienen regla distinta.",
              },
      sumaAseguradaIlimitada: false,
      canceladaAt: null,
      motivoCancelacion: null,
      renovacionEtapa: extremo ? "PERDIDA" : null,
      renovacionNota: extremo ? NOTA_PERDIDA : null,
      caratula_path: conArchivos ? "x" : null,
      caratula_nombre: conArchivos ? (f === "demo" ? "caratula.pdf" : NOMBRE_ARCHIVO_LARGO) : null,
      caratula_bytes: conArchivos ? 19_876_543 : null,
      caratula_subido_at: conArchivos ? dia(-2) : null,
      negociacion_path: extremo ? "x" : null,
      negociacion_nombre: extremo ? "Formato_de_negociacion_y_orden_de_emision_VGCOL2026000123456REN03ANEXOB.pdf" : null,
      negociacion_bytes: extremo ? 1_024 : null,
      negociacion_subido_at: extremo ? dia(-2) : null,
      expediente_path: extremo ? "x" : null,
      expediente_nombre: extremo ? "Expediente_completo_4812_asegurados_con_identificaciones_y_comprobantes.zip" : null,
      expediente_bytes: extremo ? 2_147_000_000 : null,
      expediente_subido_at: extremo ? dia(-1) : null,
      ejecutivo: c === "vacio" ? null : ejecutivo(f, 0),
      cliente: {
        id: "cli0",
        nombre: cliente(f, 0),
        rfc: RFCS[0],
        telefono: c === "vacio" ? "" : telefono(f, 0),
        email: c === "vacio" ? "" : correo(f, 0),
      },
      aseguradora: { ...aseguradora(f, 0), diasGracia: 30 },
      asegurados: rango(nAsegurados).map((i) => ({
        id: `ase${i}`,
        nombre: f === "demo" ? ciclo(["Juan Pérez García", "Ana Lucía Torres Medina", "Pablo Pérez Torres"], i) : ciclo(CLIENTES_EXTREMOS.slice(2), i),
        parentesco: i === 0 ? "Titular" : ciclo(["Conyuge", "Hijo", "Otro"], i),
        edad: i % 4 === 3 ? null : ciclo([45, 7, 101], i),
        sexo: i % 4 === 3 ? null : ciclo(["Masculino", "Femenino"], i),
        fecha_nacimiento: i % 4 === 3 ? null : "1981-03-15",
        antiguedad: f === "demo" ? "2015" : ciclo(["Desde 1998 (antigüedad reconocida de la póliza anterior)", null, "2026"], i),
      })),
      recibos: rango(nRecibos).map((i) => ({
        id: `rec${i}`,
        numero: i + 1,
        monto: dec(primaTotal / nRecibos),
        fecha_vencimiento: dia(-340 + i * 30),
        estado: c === "vacio" ? "CANCELADO" : i < nRecibos - 3 ? ciclo(["CONCILIADO", "PAGADO"] as const, i) : ciclo(["PENDIENTE", "PENDIENTE", "CANCELADO"] as const, i),
        folio: extremo && i % 3 === 0 ? `FOL-2026-${String(i).padStart(10, "0")}-COMPLEMENTO-A` : null,
        auto_creado: extremo && i % 5 === 4,
      })),
      endosos: rango(nEndosos).map((i) => ({
        id: `end${i}`,
        numero: f === "demo" ? "E-01" : ciclo(["END-2026-000451-ALTA-DE-ASEGURADOS-POR-CORTE-MENSUAL-SEPT", null], i),
        tipo: ciclo(["alta_asegurado", "baja_asegurado", "cambio_datos"], i),
        fecha: dia(-100 + i),
        descripcion: f === "demo" ? "Alta de la hija María López, 12 años" : ciclo([TEXTO_LARGO, "Baja."], i),
        prima: ciclo([dec(98_765.43), dec(-12_345_678.9), null], i),
        usuarioEmail: f === "demo" ? "laura.mendez@example.com" : "maria.guadalupe.hernandez.villasenor+renovaciones2026@example.com",
      })),
    },
    renovada: null,
    anterior: c === "vacio" ? null : { id: "pol1", numeroImpreso: f === "demo" ? "0012345677" : "VG-COL-2025-000123456-REN-02-ANEXO-B" },
    historial: rango(nHistorial).map((i) => ({
      id: `his${i}`,
      fecha: dia(-i),
      usuario: f === "demo" ? "laura.mendez@example.com" : ciclo(["maria.guadalupe.hernandez.villasenor+renovaciones2026@example.com", null], i),
      tipo: ciclo(["captura", "edicion", "conciliacion", "reversion", "aclaracion"] as const, i),
      titulo: f === "demo" ? "Edición" : ciclo(["Edición de la póliza con cambios en 14 campos capturados por la IA y corregidos a mano", "Conciliación"], i),
      descripcion: f === "demo" ? "Cambió la prima neta." : ciclo([TEXTO_LARGO, "Recibo 1/360 conciliado con comisión de $98,765,432.10"], i),
      cambios:
        i % 2 === 0
          ? [
              { campo: "Número", antes: "VG-COL-2026-000123456-REN-03", despues: "VG-COL-2026-000123456-REN-03-ANEXO-B" },
              { campo: "Prima total", antes: "$12,345,678.90", despues: "$187,654,321.09" },
            ]
          : undefined,
    })),
    tareas: tareas(c, { demo: 2, extremos: 3, vacio: 0, uno: 1, masivo: 30 }[c]),
    equipo: equipoOpciones(c),
    agencia: "Grupo Asegurador del Bajío y Occidente, Agente de Seguros y Fianzas, S.A. de C.V.",
    usuario: { id: "usr0", email: "laura.mendez@example.com", verComisiones: true, coordinaTareas: true },
    hoy: hoyISO(),
  };
}

// ── Expediente del cliente ────────────────────────────────────────────────────────────────────

export function datosCliente(c: Conjunto): DatosCliente {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  const nPolizas = { demo: 3, extremos: 12, vacio: 0, uno: 1, masivo: 300 }[c];
  const nNotas = { demo: 2, extremos: 5, vacio: 0, uno: 1, masivo: 100 }[c];
  const persona = c === "uno" || c === "demo" ? "FISICA" : "MORAL";
  return {
    cliente: {
      id: "cli0",
      nombre: cliente(f, 0),
      rfc: c === "vacio" ? "XAXX010101000" : RFCS[0],
      telefono: c === "vacio" ? "" : telefono(f, 0),
      email: c === "vacio" ? "" : correo(f, 0),
      tipoPersona: persona,
      fechaNacimiento: c === "vacio" ? null : persona === "FISICA" ? new Date(`${isoDia(3).slice(0, 4)}-${isoDia(3).slice(5)}T00:00:00Z`) : null,
      direccion:
        c === "vacio"
          ? null
          : f === "demo"
            ? "Av. Reforma 123, Col. Centro"
            : "Carretera Federal Libre Monterrey–Nuevo Laredo Km 15.5, Bodega 12-B, Parque Industrial Logístico Ciénega de Flores, entre Av. de los Industriales y Calle Sin Nombre, frente a la gasolinera, acceso por la caseta 3",
      municipio: c === "vacio" ? null : f === "demo" ? "Cuauhtémoc" : "General Zuazua",
      estado: c === "vacio" ? null : f === "demo" ? "Ciudad de México" : "Nuevo León",
      codigoPostal: c === "vacio" ? null : "65750",
      ejecutivoId: c === "vacio" ? null : "usr0",
      ejecutivo: c === "vacio" ? null : ejecutivo(f, 0),
      polizas: rango(nPolizas).map((i) => {
        const p = polizaListado(f, i);
        return {
          id: p.id,
          numeroImpreso: p.numeroImpreso,
          polizaVigor: p.polizaVigor,
          ramo: p.ramo,
          vigencia_inicio: p.vigencia_inicio,
          vigencia_fin: p.vigencia_fin,
          prima_total: p.prima_total,
          forma_pago: p.forma_pago,
          canceladaAt: p.canceladaAt,
          aseguradora: p.aseguradora,
          recibos: p.recibos,
        };
      }),
      notas: rango(nNotas).map((i) => ({
        id: `not${i}`,
        tipo: ciclo(["reunion", "llamada", "whatsapp", "correo", "nota"], i),
        texto: f === "demo" ? "Pidió la cotización de renovación." : ciclo([TEXTO_LARGO, "Ok", "x".repeat(0) + "Sin respuesta; volver a marcar el lunes."], i),
        createdAt: dia(-i),
        usuarioId: i % 2 ? "usr0" : "usr1",
        usuarioEmail: f === "demo" ? "laura.mendez@example.com" : "maria.guadalupe.hernandez.villasenor+renovaciones2026@example.com",
        poliza: i % 2 === 0 ? { id: `pol${i}`, numeroImpreso: numero(f, i) } : null,
      })),
    },
    tareas: tareas(c, { demo: 2, extremos: 3, vacio: 0, uno: 1, masivo: 30 }[c]),
    ejecutivos: ejecutivosOpciones(c),
    equipo: equipoOpciones(c),
    duplicados: rango({ demo: 0, extremos: 3, vacio: 0, uno: 1, masivo: 10 }[c]).map((i) => ({
      id: `dup${i}`,
      nombre: ciclo(CLIENTES_EXTREMOS, i),
      rfc: ciclo(RFCS, i),
      telefono: ciclo(TELEFONOS_EXTREMOS, i),
      email: ciclo(CORREOS_EXTREMOS, i),
      _count: { polizas: ciclo([1, 0, 1_284], i) },
    })),
    agencia: "Grupo Asegurador del Bajío y Occidente, Agente de Seguros y Fianzas, S.A. de C.V.",
    usuario: { id: "usr0", email: "laura.mendez@example.com", admin: true, coordinaTareas: true },
    hoy: hoyISO(),
  };
}

// ── Embudo de renovaciones ────────────────────────────────────────────────────────────────────

/** `mover` simula un cambio de etapa (p. ej. "pol0:cotizando") para ver la tarjeta viajar de columna. */
export function datosRenovaciones(c: Conjunto, mover?: { id: string; columna: ColumnaEmbudo }): DatosRenovaciones {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  const porColumna: Record<ColumnaEmbudo, number> = {
    demo: { por_renovar: 2, cotizando: 1, enviada: 1, renovada: 1, perdida: 0 },
    extremos: { por_renovar: 3, cotizando: 2, enviada: 2, renovada: 2, perdida: 2 },
    vacio: { por_renovar: 0, cotizando: 0, enviada: 0, renovada: 0, perdida: 0 },
    uno: { por_renovar: 1, cotizando: 0, enviada: 0, renovada: 0, perdida: 0 },
    // El embudo trae hasta 500 pólizas.
    masivo: { por_renovar: 300, cotizando: 100, enviada: 60, renovada: 20, perdida: 20 },
  }[c];
  const etapaDb = { por_renovar: null, cotizando: "COTIZANDO", enviada: "ENVIADA", renovada: null, perdida: "PERDIDA" } as const;
  let k = 0;
  const columnas = COLUMNAS_EMBUDO.map((col) => {
    const polizas = rango(porColumna[col.clave]).map(() => {
      const i = k++;
      const dias = ciclo([-29, 0, 3, 14, 59], i);
      const renovada = col.clave === "renovada";
      const etapa = etapaDb[col.clave];
      return {
        id: `pol${i}`,
        numeroImpreso: numero(f, i),
        polizaVigor: renovada ? "0012345678000100REN2026" : null,
        aseguradora_id: "ase0",
        ramo: ciclo(RAMOS, i),
        vigencia_fin: dia(dias),
        prima_total: prima(f, i),
        renovacionEtapa: etapa,
        renovacionNota: col.clave === "perdida" ? NOTA_PERDIDA : col.clave === "cotizando" && f === "extremos" ? "Esperando que el cliente mande el censo actualizado con las 37 altas del mes" : null,
        renovacionEtapaAt: etapa ? dia(-3) : null,
        ejecutivo: ejecutivo(f, i) && { nombre: ejecutivo(f, i)!.nombre },
        cliente: { id: `cli${i}`, nombre: cliente(f, i), telefono: telefono(f, i), email: correo(f, i) },
        aseguradora: aseguradora(f, i),
        renovacion: renovada ? { id: `ren${i}`, numeroImpreso: f === "demo" ? "0012345679" : "DAN-IND-2027-000123456-REN-04-ANEXO-B" } : null,
        dias,
        columna: columnaDe({ renovada, etapa }),
      };
    });
    return { ...col, polizas, prima: polizas.reduce((s, p) => s + p.prima_total, 0) };
  });
  const tarjeta = mover && columnas.flatMap((col) => col.polizas).find((p) => p.id === mover.id);
  if (mover && tarjeta && tarjeta.columna !== mover.columna) {
    const origen = columnas.find((col) => col.clave === tarjeta.columna)!;
    const destino = columnas.find((col) => col.clave === mover.columna)!;
    origen.polizas = origen.polizas.filter((p) => p !== tarjeta);
    destino.polizas = [{ ...tarjeta, columna: mover.columna, renovacionEtapa: etapaDb[mover.columna] }, ...destino.polizas];
    for (const col of [origen, destino]) col.prima = col.polizas.reduce((s, p) => s + p.prima_total, 0);
  }
  return {
    embudo: { hoy: hoyISO(), columnas, total: columnas.reduce((s, col) => s + col.polizas.length, 0) },
    agencia: "Grupo Asegurador del Bajío y Occidente, Agente de Seguros y Fianzas, S.A. de C.V.",
    filtro: { ejecutivos: ejecutivosOpciones(c), usuarioId: "usr0", valor: "" },
  };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────────────────────

export function datosDashboard(c: Conjunto): DatosDashboard {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  const vacio = c === "vacio";
  const uno = c === "uno";
  const nAseg = { demo: 3, extremos: 8, vacio: 0, uno: 1, masivo: 25 }[c];
  const nEjec = { demo: 2, extremos: 5, vacio: 0, uno: 1, masivo: 40 }[c];
  const nRecibos = { demo: 3, extremos: 10, vacio: 0, uno: 1, masivo: 10 }[c];
  const nVenc = { demo: 2, extremos: 8, vacio: 0, uno: 1, masivo: 8 }[c];
  const nCumple = { demo: 1, extremos: 4, vacio: 0, uno: 1, masivo: 8 }[c];
  const nTareas = { demo: 2, extremos: 6, vacio: 0, uno: 1, masivo: 6 }[c];
  const nombresAseg = [...ASEGURADORAS_EXTREMAS.map((a) => a.nombre), "Seguros Inbursa", "Mapfre México", "Chubb Seguros México, S.A."];
  return {
    dashboard: {
      rango: { desde: dia(-5), hasta: dia(24) },
      hoy: hoyISO(),
      totalPolizas: { demo: 3, extremos: 1_284, vacio: 0, uno: 1, masivo: 12_483 }[c],
      metricas: {
        primas: { valor: vacio ? 0 : uno ? 18_540.32 : f === "demo" ? 151_090.82 : 2_345_678_901.23, variacion: vacio ? null : f === "demo" ? 12.4 : -87.5 },
        activas: { valor: { demo: 3, extremos: 1_284, vacio: 0, uno: 1, masivo: 12_483 }[c], variacion: vacio || uno ? null : 1_234.5 },
        renovacion: vacio ? { tasa: null, vencidas: 0, renovadas: 0 } : uno ? { tasa: 100, vencidas: 1, renovadas: 1 } : { tasa: 33.3, vencidas: 1_284, renovadas: 428 },
        comisiones: vacio
          ? { valor: 0, recibos: 0, sinPorcentaje: 0, sinPrimaNeta: 0 }
          : uno
            ? { valor: 1_545.03, recibos: 1, sinPorcentaje: 0, sinPrimaNeta: 0 }
            : { valor: f === "demo" ? 12_840.5 : 98_765_432.1, recibos: 12_483, sinPorcentaje: 1_284, sinPrimaNeta: 311 },
      },
      produccion: rango(nAseg).map((i) => ({
        aseguradora: f === "demo" ? ciclo(ASEGURADORAS_DEMO, i).nombre : ciclo(nombresAseg, i) + (i >= nombresAseg.length ? ` ${i}` : ""),
        prima: f === "demo" ? 50_000 - i * 9_000 : Math.max(350, 187_654_321.09 / (i + 1)),
        polizas: f === "demo" ? 1 : Math.max(1, 1_284 - i * 97),
      })),
      porEjecutivo: rango(nEjec).map((i) => ({
        id: i === 1 ? null : `usr${i}`,
        ejecutivo: f === "demo" ? ciclo(EJECUTIVOS_DEMO, i) : ciclo(["María Guadalupe Hernández de la Fuente Villarreal", "Sin asignar", "Cuenta eliminada", "Luis"], i) + (i >= 4 ? ` ${i}` : ""),
        prima: f === "demo" ? 90_000 - i * 30_000 : Math.max(350, 98_765_432.1 / (i + 1)),
        polizas: Math.max(1, 640 - i * 15),
      })),
      recibos: rango(nRecibos).map((i) => ({
        id: `rec${i}`,
        numero: (i % 12) + 1,
        monto: dec(f === "demo" ? 1_545.03 : ciclo([46_913_580.27, 29.17], i)),
        fecha_vencimiento: dia(-10),
        comision_pagada: i % 3 === 2 ? null : dec(f === "demo" ? 231.75 : 9_876_543.21),
        conciliado_at: i % 4 === 3 ? null : dia(-i),
        poliza: {
          id: `pol${i}`,
          numeroImpreso: numero(f, i),
          ramo: ciclo(RAMOS, i),
          _count: { recibos: f === "demo" ? 12 : ciclo([360, 12, 1], i) },
          cliente: { nombre: cliente(f, i) },
          aseguradora: aseguradora(f, i),
        },
      })),
      vencimientos: rango(nVenc).map((i) => ({
        id: `pol${i}`,
        numeroImpreso: numero(f, i),
        polizaVigor: null,
        aseguradora_id: "ase0",
        ramo: ciclo(RAMOS, i),
        vigencia_fin: dia(ciclo([0, 3, 7, 29], i)),
        renovacionEtapa: null,
        cliente: { nombre: cliente(f, i), telefono: telefono(f, i), email: correo(f, i) },
        aseguradora: aseguradora(f, i),
      })),
    },
    paraHoy: {
      tareas: { tareas: tareas(c, nTareas).filter((t) => t.completadaAt === null), total: { demo: 2, extremos: 1_284, vacio: 0, uno: 1, masivo: 12_483 }[c] },
      renovaciones: { total: { demo: 2, extremos: 1_284, vacio: 0, uno: 1, masivo: 3_107 }[c], sinGestionar: { demo: 1, extremos: 1_284, vacio: 0, uno: 1, masivo: 2_045 }[c] },
      recibos: {
        vencidos: { demo: 1, extremos: 12_483, vacio: 0, uno: 1, masivo: 98_765 }[c],
        riesgo: { demo: 0, extremos: 1_284, vacio: 0, uno: 1, masivo: 9_876 }[c],
        semana: { cantidad: { demo: 1, extremos: 9_876, vacio: 0, uno: 1, masivo: 98_765 }[c], monto: { demo: 1_545.03, extremos: 1_234_567_890.12, vacio: 0, uno: 29.17, masivo: 98_765_432_109.87 }[c] },
      },
      aclaraciones: { demo: 0, extremos: 1_284, vacio: 0, uno: 1, masivo: 12_483 }[c],
      cumpleanos: rango(nCumple).map((i) => ({
        id: `cli${i}`,
        nombre: f === "demo" ? "Juan Pérez García" : ciclo([CLIENTES_EXTREMOS[3], "Ana", CLIENTES_EXTREMOS[5], CLIENTES_EXTREMOS[7]], i),
        telefono: telefono(f, i),
        rfc: "HEVG7203157K9",
        fechaNacimiento: new Date("1972-03-15T00:00:00Z"),
        tipoPersona: "FISICA" as const,
        nacimiento: "1925-10-06",
        dias: ciclo([0, 1, 7], i),
      })),
    },
    agencia: "Grupo Asegurador del Bajío y Occidente, Agente de Seguros y Fianzas, S.A. de C.V.",
    equipo: equipoOpciones(c),
    periodo: "mes",
    usuario: {
      id: "usr0",
      email: "laura.mendez@example.com",
      soloSuCartera: false,
      verComisiones: true,
      verConciliacion: true,
      coordinaTareas: true,
    },
  };
}

// ── Superadministrador: lobby y cobranza de la plataforma ─────────────────────────────────────

const AGENCIAS_DEMO = ["Seguros Méndez", "Protección Integral"];
const AGENCIAS_EXTREMAS = [
  "Grupo Asegurador del Bajío y Occidente, Agente de Seguros y Fianzas, S.A. de C.V.",
  "AZ",
  "PROMOTORÍA DE SEGUROS Y FIANZAS DEL NORESTE",
  "Hernández & Asociados",
  "Nguyễn Agentes de Seguros",
];

/**
 * Tareas como las ve una Líder de oficina (solo usa Tareas y coordina): saludo, su día, la vista
 * del equipo con encargados a medias y el avance de cada persona.
 */
export function datosTareas(c: Conjunto): DatosTareas {
  const equipo = equipoOpciones(c);
  const lista = tareas(c, { demo: 6, extremos: 9, vacio: 0, uno: 1, masivo: 200 }[c]).filter((t) => t.completadaAt === null);
  const resumen = {
    demo: { pendientes: 4, vencidas: 1, deHoy: 2, hechasHoy: 1, hechas: 6 },
    extremos: { pendientes: 1_284, vencidas: 312, deHoy: 48, hechasHoy: 7, hechas: 2_031 },
    vacio: { pendientes: 0, vencidas: 0, deHoy: 0, hechasHoy: 0, hechas: 0 },
    uno: { pendientes: 1, vencidas: 0, deHoy: 0, hechasHoy: 1, hechas: 1 },
    masivo: { pendientes: 12_483, vencidas: 9_870, deHoy: 1_204, hechasHoy: 0, hechas: 48_211 },
  }[c];
  return {
    usuario: {
      id: "usr0",
      email: "laura.mendez@example.com",
      nombre: c === "demo" ? "Laura Méndez" : "María Guadalupe Hernández de la Fuente Villarreal",
      soloTareas: true,
      coordinaTareas: true,
    },
    vista: "todas",
    conEquipo: true,
    tareas: lista,
    total: { demo: lista.length, extremos: lista.length, vacio: 0, uno: lista.length, masivo: 12_483 }[c],
    limite: 200,
    resumen,
    equipo,
    avance:
      c === "vacio"
        ? []
        : equipo.map((e, i) => ({
            ...e,
            pendientes: ciclo([12, 0, 3, 1_284, 1], i),
            vencidas: ciclo([2, 0, 0, 312, 1], i),
            hechas: ciclo([30, 5, 0, 2_031, 0], i),
          })),
    hoy: hoyISO(),
  };
}

export function datosSuperadmin(c: Conjunto): DatosSuperadmin {
  const f: Fila = c === "demo" ? "demo" : "extremos";
  const n = { demo: 2, extremos: 5, vacio: 0, uno: 1, masivo: 60 }[c];
  const hoy = hoyISO();
  const nombre = (i: number) => (f === "demo" ? ciclo(AGENCIAS_DEMO, i) : ciclo(AGENCIAS_EXTREMAS, i) + (i >= 5 ? ` ${i}` : ""));
  // Un estado de pago por agencia: sin configurar, al corriente, por vencer, vencida y suspendible.
  const pagadoHasta = (i: number) => (f === "demo" ? isoDia(40) : ciclo([null, isoDia(200), isoDia(2), isoDia(-3), isoDia(-400)], i));
  const cuota = (i: number) => (f === "demo" ? 2_499 : ciclo([null, 1_250_000, 185_000, 2_499, 99_999.99], i));
  return {
    agencias: rango(n).map((i) => ({
      id: `agc${i}`,
      nombre: nombre(i),
      logoUrl: f === "demo" ? null : ciclo([null, "https://logos.example.com/no-existe.png"], i),
      colorHex: f === "demo" ? "#2563EB" : ciclo(["#FFFFFF", "#000000", "#E4002B"], i),
      tema: ciclo(["dark", "light"], i),
      slug: f === "demo" ? `agencia-${i}` : ciclo(["grupo-asegurador-del-bajio-y-occidente-ag", "az"], i),
      suspendida: f === "extremos" && i % 5 === 4,
      suspendidaAt: f === "extremos" && i % 5 === 4 ? dia(-12) : null,
      motivoSuspension:
        f === "extremos" && i % 5 === 4
          ? "Falta de pago de las cuotas de julio, agosto y septiembre; el contador dijo que la transferencia sale el viernes pero ya van tres semanas con la misma respuesta. Reactivar al registrar el pago."
          : null,
      createdAt: dia(-400 + i),
      _count: { usuarios: ciclo([1, 48], i), clientes: ciclo([0, 12_483], i), polizas: ciclo([1, 148_920], i) },
    })),
    cobranza: rango(n).map((i) => {
      const cobro = { cuotaMensual: cuota(i), pagadoHasta: cuota(i) === null ? null : pagadoHasta(i), diasTolerancia: ciclo([0, 15, 30], i) };
      return {
        id: `agc${i}`,
        nombre: nombre(i),
        suspendida: f === "extremos" && i % 5 === 4,
        suspensionAutomatica: i % 2 === 0,
        correoFacturacion: f === "demo" ? "pagos@example.com" : ciclo(["cuentas.por.pagar.proveedores.tecnologia@grupoaseguradordelbajioyoccidente.example.com", null], i),
        ...cobro,
        ...estadoCobro(cobro, hoy),
        pagos: rango(cuota(i) === null ? 0 : 2).map((j) => ({
          id: `pag${i}-${j}`,
          fecha: isoDia(-30 * (j + 1)),
          monto: (cuota(i) ?? 0) * 12,
          cubreHasta: isoDia(30 * (1 - j)),
          nota: null,
          registradoPor: "superadmin@example.com",
        })),
      };
    }),
    alertas:
      f === "demo" || c === "vacio"
        ? []
        : [
            {
              clave: "correo",
              titulo: "El envío de correos no está configurado",
              detalle: "Falta RESEND_API_KEY en el servidor: los avisos automáticos de cobranza y renovación de las 60 agencias no se están enviando.",
              grave: true,
            },
            { clave: "cron", titulo: "La tarea diaria no ha corrido", detalle: "Última ejecución hace 3 días.", grave: false },
          ],
    activaId: "agc0",
    propiaId: "agc0",
    hoy,
  };
}
