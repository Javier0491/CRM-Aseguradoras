import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CAMPO_TRAMPA, correoSolicitudDemo, leerSolicitudDemo, validarSolicitudDemo } from "@/lib/landing/demo";

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [campo, valor] of Object.entries(campos)) fd.set(campo, valor);
  return fd;
}

const valida = {
  nombre: "  Ana   López ",
  correo: " Ana@Correduria.MX ",
  correduria: "Correduría\nDel Valle",
  telefono: "+52 55 1234 5678",
  plan: "broker",
  mensaje: "Trabajamos con 6 aseguradoras.\r\n\r\n\r\n\r\nSomos 12 ejecutivos.",
};

describe("solicitud de Demo VIP", () => {
  it("normaliza lo capturado: una línea en los campos cortos y el correo en minúsculas", () => {
    const { datos, esBot } = leerSolicitudDemo(formulario(valida));
    assert.equal(esBot, false);
    assert.equal(datos.nombre, "Ana López");
    assert.equal(datos.correo, "ana@correduria.mx");
    assert.equal(datos.correduria, "Correduría Del Valle");
    assert.equal(datos.mensaje, "Trabajamos con 6 aseguradoras.\n\nSomos 12 ejecutivos.");
    assert.deepEqual(validarSolicitudDemo(datos), {});
  });

  it("el campo trampa lleno delata a un bot", () => {
    assert.equal(leerSolicitudDemo(formulario({ ...valida, [CAMPO_TRAMPA]: "https://spam.example" })).esBot, true);
  });

  it("pide los obligatorios y rechaza un plan que no existe", () => {
    const { datos } = leerSolicitudDemo(formulario({ plan: "enterprise" }));
    assert.deepEqual(Object.keys(validarSolicitudDemo(datos)).sort(), ["correduria", "correo", "nombre", "plan"]);
  });

  it("el teléfono es opcional, pero si viene debe parecer un teléfono", () => {
    const sinTelefono = leerSolicitudDemo(formulario({ ...valida, telefono: "" })).datos;
    assert.deepEqual(validarSolicitudDemo(sinTelefono), {});
    const conLetras = leerSolicitudDemo(formulario({ ...valida, telefono: "llámame" })).datos;
    assert.ok(validarSolicitudDemo(conLetras).telefono);
  });

  it("el aviso al equipo comercial lleva las etiquetas legibles", () => {
    const { asunto, lineas } = correoSolicitudDemo(leerSolicitudDemo(formulario(valida)).datos);
    assert.equal(asunto, "Demo VIP · Correduría Del Valle");
    assert.ok(lineas.includes("Plan de interés: Broker"));
    const agente = correoSolicitudDemo(leerSolicitudDemo(formulario({ ...valida, plan: "agente" })).datos);
    assert.ok(agente.lineas.includes("Plan de interés: Agente"));
    // La edición elegida en la tabla de precios va con el plan; si aún no sabe, no aplica.
    const pro = correoSolicitudDemo(leerSolicitudDemo(formulario({ ...valida, plan: "broker", edicion: "PRO" })).datos);
    assert.ok(pro.lineas.includes("Plan de interés: Broker Pro"));
    const indeciso = correoSolicitudDemo(leerSolicitudDemo(formulario({ ...valida, plan: "indeciso", edicion: "PRO" })).datos);
    assert.ok(indeciso.lineas.includes("Plan de interés: Aún no lo sé"));
  });
});
