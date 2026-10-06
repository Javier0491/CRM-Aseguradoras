import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { slugDesdeNombre, slugValido } from "@/lib/agencias/slug";
import {
  diasParaCumpleanos,
  fechaNacimientoCliente,
  posiblesDuplicados,
  tipoPersonaDeRfc,
  validarCliente,
  type ClienteValores,
} from "@/lib/clientes/reglas";
import { accionCobroDiaria, estadoCobro, siguientePagadoHasta } from "@/lib/plataforma/cobranza";
import { primaEndoso, validarEndoso, validarFechaCancelacion } from "@/lib/polizas/estatus";
import { normalizarTelefono, parseNumero } from "@/lib/polizas/validacion";
import { columnaDe, notaDePerdida, urgenciaRenovacion } from "@/lib/renovaciones/reglas";
import { grupoTarea, validarTarea } from "@/lib/tareas/reglas";

describe("cobranza de la plataforma", () => {
  const base = { cuotaMensual: 1500, pagadoHasta: "2026-10-31", diasTolerancia: 5 };
  it("estado del pago según los días que faltan", () => {
    assert.equal(estadoCobro(base, "2026-10-20").estado, "al_corriente");
    assert.equal(estadoCobro(base, "2026-10-26").estado, "por_vencer");
    assert.equal(estadoCobro(base, "2026-10-31").estado, "por_vencer");
    const vencida = estadoCobro(base, "2026-11-03");
    assert.equal(vencida.estado, "vencida");
    assert.equal(vencida.dias, -3);
    assert.equal(vencida.limite, "2026-11-05");
    assert.equal(estadoCobro(base, "2026-11-06").estado, "suspendible");
    assert.equal(estadoCobro({ ...base, cuotaMensual: null }, "2026-11-06").estado, "sin_configurar");
  });
  it("el pago recorre lo ya pagado (aunque esté vencido)", () => {
    assert.equal(siguientePagadoHasta("2026-10-31", "2026-11-10", 1), "2026-11-30");
    assert.equal(siguientePagadoHasta("2026-01-31", "2026-01-15", 1), "2026-02-28");
    assert.equal(siguientePagadoHasta(null, "2026-10-05", 1), "2026-11-04");
  });
  it("la tarea diaria avisa una vez por periodo y suspende solo con la opción activa", () => {
    const agencia = { ...base, suspendida: false, suspensionAutomatica: true, avisoCobroEnviadoPara: null };
    assert.equal(accionCobroDiaria(agencia, "2026-10-20"), null);
    assert.equal(accionCobroDiaria(agencia, "2026-10-27"), "avisar");
    assert.equal(accionCobroDiaria({ ...agencia, avisoCobroEnviadoPara: "2026-10-31" }, "2026-10-28"), null);
    assert.equal(accionCobroDiaria(agencia, "2026-11-06"), "suspender");
    assert.equal(accionCobroDiaria({ ...agencia, suspensionAutomatica: false }, "2026-11-06"), "avisar");
    assert.equal(accionCobroDiaria({ ...agencia, suspendida: true }, "2026-11-06"), null);
  });
});

describe("embudo de renovaciones", () => {
  it("renovada manda sobre la etapa guardada", () => {
    assert.equal(columnaDe({ renovada: true, etapa: "PERDIDA" }), "renovada");
    assert.equal(columnaDe({ renovada: false, etapa: null }), "por_renovar");
    assert.equal(columnaDe({ renovada: false, etapa: "ENVIADA" }), "enviada");
  });
  it("urgencia", () => {
    assert.equal(urgenciaRenovacion(-1), "vencida");
    assert.equal(urgenciaRenovacion(10), "critica");
    assert.equal(urgenciaRenovacion(25), "pronto");
    assert.equal(urgenciaRenovacion(45), "a_tiempo");
  });
  it("nota de pérdida", () => {
    assert.equal(notaDePerdida("Precio", "  le dieron   20% menos "), "Precio · le dieron 20% menos");
    assert.equal(notaDePerdida("Otro", ""), "Otro");
  });
});

describe("expediente del cliente", () => {
  it("tipo de persona por el RFC", () => {
    assert.equal(tipoPersonaDeRfc("ABC010101AB1"), "MORAL");
    assert.equal(tipoPersonaDeRfc("GODE561231GR8"), "FISICA");
  });
  it("fecha de nacimiento: la capturada o la del RFC (nunca de un genérico o una moral)", () => {
    assert.deepEqual(fechaNacimientoCliente({ fechaNacimiento: null, rfc: "GODE561231GR8", tipoPersona: "FISICA" }, "2026-10-05"), {
      fecha: "1956-12-31",
      origen: "rfc",
    });
    assert.equal(fechaNacimientoCliente({ fechaNacimiento: null, rfc: "XAXX010101000", tipoPersona: "FISICA" }, "2026-10-05"), null);
    assert.equal(fechaNacimientoCliente({ fechaNacimiento: null, rfc: "ABC010101AB1", tipoPersona: "MORAL" }, "2026-10-05"), null);
    assert.equal(
      fechaNacimientoCliente({ fechaNacimiento: "1990-05-10", rfc: "GODE561231GR8", tipoPersona: "FISICA" }, "2026-10-05")?.origen,
      "capturada"
    );
  });
  it("días para el cumpleaños", () => {
    assert.equal(diasParaCumpleanos("1990-10-05", "2026-10-05"), 0);
    assert.equal(diasParaCumpleanos("1990-10-08", "2026-10-05"), 3);
    assert.equal(diasParaCumpleanos("1990-10-01", "2026-10-05"), 361);
    // 29 de febrero: el 28 en años no bisiestos.
    assert.equal(diasParaCumpleanos("2000-02-29", "2027-02-27"), 1);
  });
  it("posibles duplicados", () => {
    assert.ok(posiblesDuplicados({ nombre: "Juan Pérez", rfc: "PEJU800101AB1" }, { nombre: "J. Perez", rfc: "PEJU800101XY9" }));
    assert.ok(posiblesDuplicados({ nombre: "Héctor  Morales", rfc: "XAXX010101000" }, { nombre: "HECTOR MORALES", rfc: "XAXX010101000" }));
    assert.ok(!posiblesDuplicados({ nombre: "Ana", rfc: "XAXX010101000" }, { nombre: "Luis", rfc: "XAXX010101000" }));
  });
  it("validación del formulario", () => {
    const ok: ClienteValores = {
      nombre: "Juan Pérez",
      rfc: "PEJU800101AB1",
      telefono: "55 1234 5678",
      email: "juan@correo.mx",
      tipoPersona: "FISICA",
      fechaNacimiento: "1980-01-01",
      direccion: "",
      municipio: "",
      estado: "",
      codigoPostal: "01000",
    };
    assert.deepEqual(validarCliente(ok, "2026-10-05"), {});
    const mal = validarCliente({ ...ok, rfc: "123", telefono: "123", codigoPostal: "1", fechaNacimiento: "2030-01-01" }, "2026-10-05");
    assert.deepEqual(Object.keys(mal).sort(), ["codigoPostal", "fechaNacimiento", "rfc", "telefono"]);
  });
});

describe("cancelación y endosos", () => {
  const vigencia = { inicio: "2026-01-01", fin: "2027-01-01" };
  it("prima del endoso con signo", () => {
    assert.equal(primaEndoso("1,250.50"), 1250.5);
    assert.equal(primaEndoso("-300"), -300);
    assert.equal(primaEndoso("(300)"), -300);
    assert.equal(primaEndoso(""), null);
    assert.equal(primaEndoso("1.234"), null);
  });
  it("el endoso debe caer en la vigencia y tener descripción", () => {
    const valido = { tipo: "alta_asegurado", fecha: "2026-03-01", numero: "", descripcion: "Alta de la hija", prima: "-100" };
    assert.deepEqual(validarEndoso(valido, vigencia), {});
    assert.ok(validarEndoso({ ...valido, fecha: "2027-02-01" }, vigencia).fecha);
    assert.ok(validarEndoso({ ...valido, tipo: "x", descripcion: " " }, vigencia).descripcion);
  });
  it("fecha de cancelación", () => {
    assert.equal(validarFechaCancelacion("2026-06-01", vigencia), null);
    assert.ok(validarFechaCancelacion("2025-12-31", vigencia));
  });
});

describe("tareas", () => {
  it("grupos", () => {
    assert.equal(grupoTarea({ vence: "2026-10-04", completada: false }, "2026-10-05"), "vencida");
    assert.equal(grupoTarea({ vence: "2026-10-05", completada: false }, "2026-10-05"), "hoy");
    assert.equal(grupoTarea({ vence: "2026-10-06", completada: false }, "2026-10-05"), "proxima");
    assert.equal(grupoTarea({ vence: "2026-10-04", completada: true }, "2026-10-05"), "completada");
  });
  it("validación", () => {
    assert.deepEqual(validarTarea({ titulo: "Llamar", descripcion: "", vence: "2026-10-05" }), {});
    assert.deepEqual(Object.keys(validarTarea({ titulo: " ", descripcion: "", vence: "2026-02-30" })).sort(), ["titulo", "vence"]);
  });
});

describe("liga de acceso de la agencia", () => {
  it("slug desde el nombre", () => {
    assert.equal(slugDesdeNombre("PJ MAGNUS"), "pj-magnus");
    assert.equal(slugDesdeNombre("Seguros Ruíz & Asociados, S.A."), "seguros-ruiz-asociados-s-a");
    assert.equal(slugDesdeNombre("Ñ"), "agencia-n");
    assert.ok(slugValido(slugDesdeNombre("x".repeat(90))));
  });
  it("validación", () => {
    assert.ok(slugValido("mi-agencia-2"));
    assert.ok(!slugValido("Mi Agencia"));
    assert.ok(!slugValido("-mal"));
  });
});

describe("normalización de capturas", () => {
  it("teléfono de México", () => {
    assert.equal(normalizarTelefono("+52 1 55 1234 5678"), "5512345678");
    assert.equal(normalizarTelefono("(55) 1234-5678"), "5512345678");
  });
  it("montos", () => {
    assert.equal(parseNumero("$ 48,320.40"), 48320.4);
    assert.ok(Number.isNaN(parseNumero("")));
  });
});
