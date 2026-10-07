import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mensajeAgradecimientoRenovacion, mensajeAviso } from "@/lib/avisos/mensajes";
import { avisoDeRecibo } from "@/lib/avisos/reglas";
import { construirCorreoHtml, htmlATexto } from "@/lib/comunicaciones/correo";

describe("avisos de cobro", () => {
  const base = { vencimiento: "2026-10-20", primerAviso: null, diasAntes: 5, diasSegundo: 10 };

  it("primer aviso (próximo recibo a pagar): los días antes del vencimiento, hasta ese día", () => {
    assert.equal(avisoDeRecibo({ ...base, hoy: "2026-10-14" }), null);
    assert.equal(avisoDeRecibo({ ...base, hoy: "2026-10-15" }), "por_vencer");
    assert.equal(avisoDeRecibo({ ...base, hoy: "2026-10-20" }), "por_vencer");
  });

  it("segundo aviso: 10 días después del primero, durante una semana", () => {
    const conPrimero = { ...base, primerAviso: "2026-10-15" };
    assert.equal(avisoDeRecibo({ ...conPrimero, hoy: "2026-10-16" }), null);
    assert.equal(avisoDeRecibo({ ...conPrimero, hoy: "2026-10-24" }), null);
    assert.equal(avisoDeRecibo({ ...conPrimero, hoy: "2026-10-25" }), "vencido");
    assert.equal(avisoDeRecibo({ ...conPrimero, hoy: "2026-11-01" }), "vencido");
    // Pasada la ventana ya no se reclama.
    assert.equal(avisoDeRecibo({ ...conPrimero, hoy: "2026-11-02" }), null);
  });

  it("si el primero no salió, el segundo se cuenta desde el vencimiento", () => {
    const sinPrimero = { ...base, diasAntes: null };
    assert.equal(avisoDeRecibo({ ...sinPrimero, hoy: "2026-10-20" }), null);
    assert.equal(avisoDeRecibo({ ...sinPrimero, hoy: "2026-10-29" }), null);
    assert.equal(avisoDeRecibo({ ...sinPrimero, hoy: "2026-10-30" }), "vencido");
  });

  it("con el segundo aviso apagado solo sale el primero", () => {
    assert.equal(avisoDeRecibo({ ...base, diasSegundo: null, primerAviso: "2026-10-15", hoy: "2026-10-25" }), null);
  });

  it("textos: próximo recibo a pagar y segundo aviso antes o después del vencimiento", () => {
    const datos = {
      cliente: "Ana",
      poliza: "GNP-1",
      aseguradora: "GNP",
      fecha: "2026-10-20",
      monto: 1234,
      numeroRecibo: 3,
      diasGracia: 30,
    };
    const primero = mensajeAviso("por_vencer", datos);
    assert.equal(primero.titulo, "Próximo recibo a pagar");
    assert.match(primero.asunto, /^Próximo recibo a pagar de tu póliza GNP-1/);
    assert.match(primero.mensaje, /tu próximo recibo a pagar es el recibo 3 de tu póliza GNP-1 con GNP, por \$1,234\.00 y vence el/);

    const antes = mensajeAviso("vencido", { ...datos, hoy: "2026-10-18" });
    assert.match(antes.asunto, /^Segundo aviso: tu recibo de la póliza GNP-1 vence el/);
    assert.doesNotMatch(antes.mensaje, /venció/);

    const despues = mensajeAviso("vencido", { ...datos, hoy: "2026-10-25" });
    assert.match(despues.asunto, /^Segundo aviso: recibo vencido/);
    assert.match(despues.mensaje, /venció el 20 oct 2026[^\n]*\nTodavía puedes pagarlo hasta el 19 nov 2026/);

    // Sin gracia, o con la gracia ya agotada, no promete un plazo que ya pasó.
    assert.match(mensajeAviso("vencido", { ...datos, diasGracia: 0, hoy: "2026-10-25" }).mensaje, /a la brevedad/);
    assert.match(mensajeAviso("vencido", { ...datos, diasGracia: 3, hoy: "2026-10-25" }).mensaje, /a la brevedad/);
  });
});

describe("correos a clientes", () => {
  it("agradecimiento por renovar: número, vigencia nuevos y correo de servicio", () => {
    const m = mensajeAgradecimientoRenovacion({
      agencia: "PJ Magnus",
      poliza: "GMM-2027",
      ramo: "Gastos Médicos Mayores",
      aseguradora: "GNP",
      inicio: "2026-11-01",
      fin: "2027-11-01",
      correoServicio: "servicio@magnusseguros.com",
    });
    assert.equal(m.titulo, "¡Gracias por continuar con nosotros!");
    assert.match(m.asunto, /tu póliza GMM-2027 ya está renovada/);
    assert.match(m.mensaje, /Tu póliza de Gastos Médicos Mayores con GNP ya quedó renovada/);
    assert.match(m.mensaje, /Póliza GMM-2027, vigente del 01 nov 2026 al 01 nov 2027\./);
    assert.match(m.mensaje, /escríbenos a servicio@magnusseguros\.com/);
  });

  it("los correos masivos invitan a escribir al correo de servicio", () => {
    const marca = { nombre: "PJ Magnus", colorHex: "#C5A059", logoUrl: null, tema: "dark" };
    const con = construirCorreoHtml({ asunto: "Hola", cuerpo: "<p>Aviso</p>", marca: { ...marca, correoServicio: "servicio@magnusseguros.com" } });
    assert.match(con, /mailto:servicio@magnusseguros\.com/);
    assert.match(htmlATexto(con), /¿Dudas o aclaraciones\? Escríbenos a servicio@magnusseguros\.com/);
    const sin = construirCorreoHtml({ asunto: "Hola", cuerpo: "<p>Aviso</p>", marca });
    assert.doesNotMatch(sin, /mailto:/);
    assert.match(sin, /responde directamente a este mensaje/);
  });
});
