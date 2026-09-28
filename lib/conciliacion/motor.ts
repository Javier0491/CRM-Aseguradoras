import "server-only";

import { anioDePoliza, comisionEsperada, edadDelTitular, resolverPorcentaje } from "@/lib/conciliacion/comisiones";
import {
  TOLERANCIA_MXN,
  type FilaEstado,
  type ResultadoMatch,
  type ResumenMatch,
} from "@/lib/conciliacion/tipos";
import { db } from "@/lib/db";
import { extraerPolizaVigor } from "@/lib/polizas/polizaParser";

const soloAlfanumerico = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Cruza los renglones de un estado de cuenta contra las pólizas y recibos de la aseguradora.
 *
 * - La póliza del archivo se busca por póliza vigor (la llave de cobranza) o por número impreso.
 * - Cada renglón toma el recibo más antiguo aún no conciliado de esa póliza (o el número de
 *   recibo indicado), sin repetir: dos renglones de la misma póliza pagan recibos distintos.
 * - Comisión esperada = monto del recibo × % (personalizado de la póliza o el de la matriz
 *   según ramo, año de la póliza y edad del titular).
 */
export async function cruzarEstadoDeCuenta(aseguradoraId: string, filas: readonly FilaEstado[]) {
  const vigores = [...new Set(filas.map((f) => extraerPolizaVigor(f.poliza)).filter(Boolean))];
  const impresos = [...new Set(filas.map((f) => f.poliza.trim().toUpperCase()).filter(Boolean))];

  const [polizas, esquemas] = await Promise.all([
    db.poliza.findMany({
      where: {
        aseguradora_id: aseguradoraId,
        OR: [{ polizaVigor: { in: vigores } }, { numeroImpreso: { in: impresos } }],
      },
      select: {
        id: true,
        numeroImpreso: true,
        polizaVigor: true,
        ramo: true,
        vigencia_inicio: true,
        comision_personalizada_pct: true,
        cliente: { select: { nombre: true } },
        asegurados: { select: { parentesco: true, orden: true, edad: true, fecha_nacimiento: true } },
        recibos: {
          orderBy: { fecha_vencimiento: "asc" },
          select: { id: true, numero: true, monto: true, fecha_vencimiento: true, estado: true },
        },
      },
    }),
    db.esquemaComision.findMany({
      where: { aseguradora_id: aseguradoraId },
      select: { ramo: true, anio_poliza: true, porcentaje: true, edad_minima: true, edad_maxima: true },
    }),
  ]);

  const esquemasNum = esquemas.map((e) => ({ ...e, porcentaje: Number(e.porcentaje) }));

  // Primera vigencia de cada cadena (misma póliza vigor) para calcular el año de la póliza.
  const primeraVigencia = new Map<string, Date>();
  for (const p of polizas) {
    const clave = p.polizaVigor ?? p.id;
    const actual = primeraVigencia.get(clave);
    if (!actual || p.vigencia_inicio < actual) primeraVigencia.set(clave, p.vigencia_inicio);
  }

  const usados = new Set<string>();
  const resultados: ResultadoMatch[] = filas.map((fila) => {
    const base = {
      fila: fila.fila,
      polizaArchivo: fila.poliza,
      comisionPagada: fila.comisionPagada,
      poliza: null,
      recibo: null,
      comisionEsperada: null,
      diferencia: null,
      porcentaje: null,
    };

    const vigor = extraerPolizaVigor(fila.poliza);
    const impreso = soloAlfanumerico(fila.poliza);
    const coincidentes = polizas.filter(
      (p) => (vigor && p.polizaVigor === vigor) || soloAlfanumerico(p.numeroImpreso) === impreso
    );
    if (coincidentes.length === 0) {
      return { ...base, estatus: "no_encontrado", detalle: "La póliza no está registrada con esta aseguradora." };
    }

    // Recibos pendientes de conciliar de la cadena, del más antiguo al más reciente.
    const pendientes = coincidentes
      .flatMap((p) => p.recibos.map((r) => ({ ...r, poliza: p, total: p.recibos.length })))
      .filter((r) => r.estado !== "CONCILIADO" && !usados.has(r.id))
      .filter((r) => fila.recibo === undefined || r.numero === fila.recibo)
      .sort((a, b) => a.fecha_vencimiento.getTime() - b.fecha_vencimiento.getTime());

    const principal = coincidentes[coincidentes.length - 1];
    const polizaInfo = (p: typeof principal) => ({ id: p.id, numeroImpreso: p.numeroImpreso, cliente: p.cliente.nombre });

    // Un monto negativo (devolución o cancelación) se revisa a mano y no ocupa un recibo:
    // así no le quita el recibo a un pago real que venga después en el archivo.
    if (fila.comisionPagada < 0) {
      return {
        ...base,
        poliza: polizaInfo(principal),
        estatus: "revisar",
        detalle: "Monto negativo: posible devolución o cancelación.",
      };
    }

    const recibo = pendientes[0];
    if (!recibo) {
      return {
        ...base,
        poliza: polizaInfo(principal),
        estatus: "revisar",
        detalle:
          fila.recibo !== undefined
            ? `El recibo ${fila.recibo} no existe o ya está conciliado.`
            : "La póliza no tiene recibos pendientes de conciliar.",
      };
    }
    usados.add(recibo.id);

    const monto = Number(recibo.monto);
    const conRecibo = {
      ...base,
      poliza: polizaInfo(recibo.poliza),
      recibo: { id: recibo.id, numero: recibo.numero, total: recibo.total, monto },
    };

    const anio = anioDePoliza(
      primeraVigencia.get(recibo.poliza.polizaVigor ?? recibo.poliza.id) ?? recibo.poliza.vigencia_inicio,
      recibo.fecha_vencimiento
    );
    const porcentaje = resolverPorcentaje(
      {
        personalizado:
          recibo.poliza.comision_personalizada_pct !== null ? Number(recibo.poliza.comision_personalizada_pct) : null,
        ramo: recibo.poliza.ramo,
      },
      anio,
      edadDelTitular(recibo.poliza.asegurados, recibo.fecha_vencimiento),
      esquemasNum
    );
    if (!porcentaje) {
      return {
        ...conRecibo,
        estatus: "revisar",
        detalle: `Sin esquema de comisión para este ramo (año ${anio} de la póliza).`,
      };
    }

    const esperada = comisionEsperada(monto, porcentaje.valor);
    const diferencia = Math.round((fila.comisionPagada - esperada) * 100) / 100;
    const coincide = Math.abs(diferencia) <= TOLERANCIA_MXN;
    return {
      ...conRecibo,
      porcentaje,
      comisionEsperada: esperada,
      diferencia,
      estatus: coincide ? "conciliado" : "diferencia",
      detalle: coincide ? null : diferencia > 0 ? "Pagaron de más." : "Pagaron de menos.",
    };
  });

  const resumen: ResumenMatch = {
    conciliado: 0,
    diferencia: 0,
    no_encontrado: 0,
    revisar: 0,
    esperada: 0,
    pagada: 0,
    pagadaSinCruce: 0,
  };
  for (const r of resultados) {
    resumen[r.estatus]++;
    // Solo se comparan los renglones con comisión esperada; el resto se reporta aparte.
    if (r.comisionEsperada !== null) {
      resumen.esperada += r.comisionEsperada;
      resumen.pagada += r.comisionPagada;
    } else {
      resumen.pagadaSinCruce += r.comisionPagada;
    }
  }
  const centavos = (n: number) => Math.round(n * 100) / 100;
  resumen.esperada = centavos(resumen.esperada);
  resumen.pagada = centavos(resumen.pagada);
  resumen.pagadaSinCruce = centavos(resumen.pagadaSinCruce);

  return { resultados, resumen };
}
