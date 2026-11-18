import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aseguradorasDelRamo, canalDe, CATALOGO_ASEGURADORAS, nombreAseguradora } from "@/lib/cotizador/aseguradoras";
import { agruparSolicitudes } from "@/lib/cotizador/comparativo";
import { generarLlave, hashLlave, llaveDeEncabezado } from "@/lib/cotizador/llave";
import type { SolicitudVista } from "@/lib/cotizador/queries";
import {
  ASEGURADORAS_COTIZADOR,
  aseguradorasDelRobot,
  clavePdfCotizacion,
  COBERTURAS_PREDETERMINADAS,
  edadEn,
  esPdf,
  nombrePdfCotizacion,
  MAX_ASEGURADORAS_POR_ENVIO,
  validarAseguradoras,
  validarDatosCotizacion,
  validarResultado,
} from "@/lib/cotizador/reglas";

// El caso real con que se probó el robot en Qualitas el 2026-11-17.
const mazda = () => ({
  aseguradora: "QUALITAS",
  vehiculo: { anio: 2017, marca: " mazda ", modelo: "Mazda 3", version: "I Touring 4P", transmision: "AUT", serie: "jm1bn1v32h1128815", placas: "rcp446a" },
  conductor: { nombre: "Oscar Eduardo Del Razo Martinez", fechaNacimiento: "1977-03-04", sexo: "H", codigoPostal: "62260" },
  coberturas: { ...COBERTURAS_PREDETERMINADAS },
  formaPago: "CONTADO",
  notas: "",
});

describe("solicitud de cotización de auto", () => {
  it("normaliza un caso completo", () => {
    const r = validarDatosCotizacion(mazda());
    assert.ok(r.ok);
    assert.equal(r.valor.vehiculo.marca, "MAZDA");
    assert.equal(r.valor.vehiculo.serie, "JM1BN1V32H1128815");
    assert.equal(r.valor.vehiculo.placas, "RCP446A");
    assert.equal(r.valor.conductor.nombre, "OSCAR EDUARDO DEL RAZO MARTINEZ");
    // Paquete básico: sin adicionales, gastos médicos 200 mil y bonificación máxima.
    assert.equal(r.valor.coberturas.gastosMedicosOcupantes, 200_000);
    assert.equal(r.valor.coberturas.rcComplementariaPersonas, null);
    assert.equal(r.valor.coberturas.rcDanosOcupantes, null);
    assert.equal(r.valor.coberturas.bonificacionMaxima, true);
    assert.equal(r.valor.notas, null);
  });

  it("sin INE basta el código postal", () => {
    const d = mazda();
    d.conductor = { nombre: "", fechaNacimiento: "", sexo: "", codigoPostal: "62260" };
    const r = validarDatosCotizacion(d);
    assert.ok(r.ok);
    assert.equal(r.valor.conductor.nombre, null);
    assert.equal(r.valor.conductor.fechaNacimiento, null);
    assert.equal(r.valor.conductor.sexo, null);
  });

  it("exige código postal de 5 dígitos, año razonable y VIN de 17", () => {
    const sinCp = mazda();
    sinCp.conductor.codigoPostal = "6226";
    assert.equal(validarDatosCotizacion(sinCp).ok, false);
    const anio = mazda();
    anio.vehiculo.anio = 1900;
    assert.equal(validarDatosCotizacion(anio).ok, false);
    const vin = mazda();
    vin.vehiculo.serie = "ABC123";
    assert.equal(validarDatosCotizacion(vin).ok, false);
    const sinSerie = mazda();
    sinSerie.vehiculo.serie = "";
    assert.ok(validarDatosCotizacion(sinSerie).ok);
  });

  it("rechaza aseguradoras, deducibles y montos que no existen", () => {
    assert.equal(validarDatosCotizacion({ ...mazda(), aseguradora: "GNP" }).ok, false);
    assert.equal(validarDatosCotizacion({ ...mazda(), aseguradora: "constructor" }).ok, false);
    assert.equal(validarDatosCotizacion({ ...mazda(), coberturas: { ...COBERTURAS_PREDETERMINADAS, deducibleDM: 7 } }).ok, false);
    assert.equal(validarDatosCotizacion({ ...mazda(), coberturas: { ...COBERTURAS_PREDETERMINADAS, gastosMedicosOcupantes: -1 } }).ok, false);
    assert.equal(validarDatosCotizacion(null).ok, false);
  });

  it("los extras se agregan a mano y solo del catálogo", () => {
    const r = validarDatosCotizacion({
      ...mazda(),
      coberturas: { ...COBERTURAS_PREDETERMINADAS, rcDanosOcupantes: 1_000_000, extras: ["LLANTAS", "RINES", "LLANTAS"] },
      notas: "equipo especial por rines de $20,000",
    });
    assert.ok(r.ok);
    assert.equal(r.valor.coberturas.rcDanosOcupantes, 1_000_000);
    assert.deepEqual(r.valor.coberturas.extras, ["LLANTAS", "RINES"]);
    assert.equal(r.valor.notas, "equipo especial por rines de $20,000");
    assert.equal(validarDatosCotizacion({ ...mazda(), coberturas: { ...COBERTURAS_PREDETERMINADAS, extras: ["BLINDAJE"] } }).ok, false);
    // Solicitudes sin la lista de extras (anteriores a ella) se aceptan como "sin extras".
    const sinExtras: Partial<typeof COBERTURAS_PREDETERMINADAS> = { ...COBERTURAS_PREDETERMINADAS };
    delete sinExtras.extras;
    const viejo = validarDatosCotizacion({ ...mazda(), coberturas: sinExtras });
    assert.ok(viejo.ok);
    assert.deepEqual(viejo.valor.coberturas.extras, []);
  });

  it("calcula la edad cumplida", () => {
    assert.equal(edadEn("1977-03-04", "2026-11-17"), 49);
    assert.equal(edadEn("1977-11-18", "2026-11-17"), 48);
    assert.equal(edadEn("1977-11-17", "2026-11-17"), 49);
    assert.equal(edadEn("no", "2026-11-17"), null);
  });
});

describe("datos que piden las aseguradoras (escaneo 2026-11-18)", () => {
  const hoy = "2026-11-18";

  it("sin datos nuevos usa auto residente, valor comercial, persona física y vigencia desde hoy", () => {
    const r = validarDatosCotizacion(mazda(), hoy);
    assert.ok(r.ok);
    assert.equal(r.valor.vehiculo.tipo, "AUTO");
    assert.equal(r.valor.vehiculo.procedencia, "RESIDENTE");
    assert.equal(r.valor.vehiculo.valor, "COMERCIAL");
    assert.equal(r.valor.tipoPersona, "FISICA");
    assert.equal(r.valor.vigenciaInicio, hoy);
  });

  it("acepta los valores del formulario y rechaza los que no existen", () => {
    const d = { ...mazda(), tipoPersona: "MORAL", vigenciaInicio: "2026-12-01" };
    d.vehiculo = { ...d.vehiculo, tipo: "PICKUP", procedencia: "FRONTERIZO", valor: "FACTURA" } as typeof d.vehiculo;
    const r = validarDatosCotizacion(d, hoy);
    assert.ok(r.ok);
    assert.equal(r.valor.vehiculo.tipo, "PICKUP");
    assert.equal(r.valor.tipoPersona, "MORAL");
    assert.equal(r.valor.vigenciaInicio, "2026-12-01");
    assert.equal(validarDatosCotizacion({ ...mazda(), tipoPersona: "OTRA" }, hoy).ok, false);
    assert.equal(validarDatosCotizacion({ ...mazda(), vehiculo: { ...mazda().vehiculo, tipo: "AVION" } }, hoy).ok, false);
    assert.equal(validarDatosCotizacion({ ...mazda(), vigenciaInicio: "2026-11-01" }, hoy).ok, false);
  });

  it("Zurich no cotiza sin fecha de nacimiento y sexo; Qualitas sí", () => {
    const sinIne = mazda();
    sinIne.conductor = { nombre: "", fechaNacimiento: "", sexo: "", codigoPostal: "62260" };
    assert.ok(validarDatosCotizacion(sinIne, hoy).ok);
    const z = validarDatosCotizacion({ ...sinIne, aseguradora: "ZURICH" }, hoy);
    assert.equal(z.ok, false);
    assert.match(z.ok ? "" : z.error, /Zurich necesita/);
    assert.ok(validarDatosCotizacion({ ...mazda(), aseguradora: "ZURICH" }, hoy).ok);
    const futuro = mazda();
    futuro.conductor.fechaNacimiento = "2030-01-01";
    assert.equal(validarDatosCotizacion(futuro, hoy).ok, false);
  });
});

describe("resultado del robot", () => {
  const resultado = () => ({
    numeroCotizacion: "1251457848",
    paquete: "AMPLIA",
    formaPago: "CONTADO",
    primaTotal: 7935.59,
    primaNeta: 6296.97,
    derechoPoliza: 670,
    iva: 1094.56,
    bonificacion: 35,
    sumaAseguradaVehiculo: 158000,
    otrasFormasPago: [],
    coberturas: [{ cobertura: "Daños materiales", sumaAsegurada: "$158,000", deducible: "5%", prima: 3049.36 }],
    avisos: ["La serie está amparada en la póliza vigente 1340512687."],
  });

  it("acepta el resultado real de Qualitas", () => {
    const r = validarResultado(resultado());
    assert.ok(r.ok);
    assert.equal(r.valor.primaTotal, 7935.59);
    assert.equal(r.valor.coberturas.length, 1);
    assert.equal(r.valor.avisos.length, 1);
  });

  it("rechaza resultados sin prima o con importes que no son números", () => {
    assert.equal(validarResultado({ ...resultado(), primaTotal: 0 }).ok, false);
    assert.equal(validarResultado({ ...resultado(), primaTotal: "7935" }).ok, false);
    assert.equal(validarResultado({ ...resultado(), iva: "1094" }).ok, false);
    assert.equal(validarResultado({ ...resultado(), formaPago: "DIARIO" }).ok, false);
    assert.equal(validarResultado({ ...resultado(), otrasFormasPago: [{ formaPago: "MENSUAL", primaTotal: -5 }] }).ok, false);
  });
});

describe("PDF de la aseguradora", () => {
  it("reconoce un PDF por sus primeros bytes", () => {
    assert.equal(esPdf(new TextEncoder().encode("%PDF-1.4\n...")), true);
    assert.equal(esPdf(new TextEncoder().encode("<html>")), false);
    assert.equal(esPdf(new Uint8Array()), false);
  });

  it("guarda cada PDF en una carpeta de la agencia y la cotización, con clave nueva", () => {
    const agencia = "0b6f3c1e-1111-4222-8333-944445555666";
    const a = clavePdfCotizacion(agencia, "cmwm9kj3l000008k4bf3fopig");
    assert.match(a, /^cotizaciones\/0b6f3c1e-1111-4222-8333-944445555666\/cmwm9kj3l000008k4bf3fopig\/[0-9a-f-]{36}\.pdf$/);
    assert.notEqual(a, clavePdfCotizacion(agencia, "cmwm9kj3l000008k4bf3fopig"));
  });

  it("descarga con un nombre que dice qué es", () => {
    assert.equal(
      nombrePdfCotizacion("QUALITAS", "1251879762", { marca: "HYUNDAI", modelo: "HB", anio: 2023 }),
      "Cotizacion Qualitas 1251879762 HYUNDAI HB 2023.pdf"
    );
    assert.equal(nombrePdfCotizacion("QUALITAS", null, { marca: "MAZDA", modelo: "3/I", anio: 2017 }), "Cotizacion Qualitas MAZDA 3_I 2017.pdf");
  });
});

describe("llave del robot", () => {
  it("se reconoce en el encabezado y su hash es estable", () => {
    const llave = generarLlave();
    assert.match(llave, /^zsr_[A-Za-z0-9_-]{43}$/);
    assert.equal(llaveDeEncabezado(`Bearer ${llave}`), llave);
    assert.equal(hashLlave(llave), hashLlave(llave));
    assert.notEqual(hashLlave(llave), hashLlave(generarLlave()));
  });

  it("rechaza encabezados sin la forma de una llave", () => {
    assert.equal(llaveDeEncabezado(null), null);
    assert.equal(llaveDeEncabezado("Bearer abc"), null);
    assert.equal(llaveDeEncabezado(`Basic ${generarLlave()}`), null);
    assert.equal(llaveDeEncabezado("Bearer zsr_corta"), null);
  });
});

describe("multicotizador", () => {
  it("el catálogo y lo que acepta el robot coinciden", () => {
    const conRobot = Object.keys(CATALOGO_ASEGURADORAS).filter((k) => canalDe(k, "AUTOS") === "ROBOT");
    assert.deepEqual(conRobot.sort(), Object.keys(ASEGURADORAS_COTIZADOR).sort());
  });

  it("lista las aseguradoras de un ramo con las disponibles primero", () => {
    const autos = aseguradorasDelRamo("AUTOS");
    assert.deepEqual(autos.slice(0, 2).map((a) => a.clave), ["QUALITAS", "ZURICH"]);
    assert.equal(autos[1].canal, "ROBOT");
    assert.ok(autos.some((a) => a.clave === "GNP" && a.canal === null));
    assert.ok(!autos.some((a) => a.clave === "METLIFE"));
    assert.ok(aseguradorasDelRamo("GMM").some((a) => a.clave === "METLIFE"));
    assert.equal(nombreAseguradora("ANA"), "ANA Seguros");
    assert.equal(nombreAseguradora("constructor"), "constructor");
  });

  it("valida las aseguradoras elegidas", () => {
    const r = validarAseguradoras(["QUALITAS", "QUALITAS"]);
    assert.ok(r.ok);
    assert.deepEqual(r.valor, ["QUALITAS"]);
    assert.equal(validarAseguradoras([]).ok, false);
    assert.equal(validarAseguradoras("QUALITAS").ok, false);
    // GNP está en el catálogo pero todavía no se puede cotizar.
    assert.equal(validarAseguradoras(["QUALITAS", "GNP"]).ok, false);
    assert.ok(validarAseguradoras(["QUALITAS", "ZURICH"]).ok);
    assert.equal(validarAseguradoras(["constructor"]).ok, false);
    assert.equal(validarAseguradoras(Array.from({ length: MAX_ASEGURADORAS_POR_ENVIO + 1 }, (_, i) => `X${i}`)).ok, false);
    assert.equal(validarDatosCotizacion({ ...mazda(), aseguradora: "toString" }).ok, false);
  });

  it("el robot pide solo de los portales con sesión abierta", () => {
    assert.equal(aseguradorasDelRobot(null), null);
    assert.deepEqual(aseguradorasDelRobot(" qualitas, GNP ,qualitas"), ["QUALITAS"]);
    assert.deepEqual(aseguradorasDelRobot("QUALITAS,ZURICH"), ["QUALITAS", "ZURICH"]);
    assert.deepEqual(aseguradorasDelRobot(""), []);
  });

  it("agrupa un envío y ordena de la más barata a la más cara", () => {
    const base = (id: string, aseguradora: string, grupoId: string | null, prima: number | null) =>
      ({
        id,
        aseguradora,
        grupoId,
        estado: prima === null ? "PENDIENTE" : "LISTA",
        resultado: prima === null ? null : { primaTotal: prima },
      }) as unknown as SolicitudVista;
    const grupos = agruparSolicitudes([
      base("a", "QUALITAS", "g1", 12_000),
      base("b", "GNP", "g1", null),
      base("c", "QUALITAS", null, 9_000),
      base("d", "HDI", "g1", 10_500),
    ]);
    assert.equal(grupos.length, 2);
    assert.deepEqual(grupos[0].solicitudes.map((s) => s.id), ["d", "a", "b"]);
    assert.deepEqual(grupos[1].solicitudes.map((s) => s.id), ["c"]);
  });
});
