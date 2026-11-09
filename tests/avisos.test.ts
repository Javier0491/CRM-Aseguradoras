import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mensajeAgradecimientoRenovacion, mensajeAviso, mensajeEndoso, mensajePolizaNueva } from "@/lib/avisos/mensajes";
import { avisoDeRecibo } from "@/lib/avisos/reglas";
import { adjuntoPermitido, construirCorreoHtml, htmlATexto, leerCco } from "@/lib/comunicaciones/correo";

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

  it("póliza nueva: avisa que ya está lista, con vigencia, documentos y correo de servicio", () => {
    const m = mensajePolizaNueva({
      agencia: "PJ Magnus",
      poliza: "AUTO-123",
      ramo: "Autos",
      aseguradora: "Qualitas",
      inicio: "2026-11-09",
      fin: "2027-11-09",
      correoServicio: "servicio@magnusseguros.com",
      documentos: { adjuntos: ["la carátula", "el expediente completo"], enlaces: [] },
    });
    assert.equal(m.titulo, "¡Tu nueva póliza ya está lista!");
    assert.match(m.asunto, /Tu nueva póliza AUTO-123 ya está lista/);
    assert.match(m.mensaje, /Tu nueva póliza de Autos con Qualitas ya está lista\. Gracias por confiar en PJ Magnus/);
    assert.match(m.mensaje, /Póliza AUTO-123, vigente del 09 nov 2026 al 09 nov 2027\./);
    assert.match(m.mensaje, /Te adjuntamos la carátula y el expediente completo de tu póliza/);
    assert.match(m.mensaje, /escríbenos a servicio@magnusseguros\.com/);
    assert.doesNotMatch(m.mensaje, /renovada/);
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

describe("copia oculta y adjuntos", () => {
  it("lee la copia oculta separada por comas, punto y coma o espacios, sin repetidas", () => {
    const r = leerCco(" ana@agencia.com; Luis@Agencia.com,ana@agencia.com  luis@agencia.com ");
    assert.deepEqual(r.correos, ["ana@agencia.com", "luis@agencia.com"]);
    assert.deepEqual(r.invalidos, []);
    assert.deepEqual(leerCco("").correos, []);
    assert.deepEqual(leerCco("ana@agencia.com, ana@").invalidos, ["ana@"]);
  });

  it("solo deja adjuntar documentos e imágenes, nada ejecutable", () => {
    assert.equal(adjuntoPermitido("Póliza GMM.PDF"), true);
    assert.equal(adjuntoPermitido("tarifas.xlsx"), true);
    assert.equal(adjuntoPermitido("foto.jpeg"), true);
    assert.equal(adjuntoPermitido("instalador.exe"), false);
    assert.equal(adjuntoPermitido("script.js"), false);
    assert.equal(adjuntoPermitido("sin-extension"), false);
    assert.equal(adjuntoPermitido(".pdf"), false);
  });
});

describe("aviso de endoso al cliente", () => {
  const base = {
    agencia: "PJ MAGNUS",
    poliza: "0000685925",
    ramo: "GMM Individual",
    aseguradora: "MetLife",
    inicio: "2026-07-01",
    fin: "2027-07-01",
    correoServicio: "servicio@pjmagnus.mx",
    documentos: { adjuntos: ["la carátula"], enlaces: [] },
  };

  it("dice que se realizaron los cambios y detalla el endoso registrado", () => {
    const m = mensajeEndoso({
      ...base,
      endoso: { tipo: "Alta de asegurado", numero: "E-03", fecha: "2026-11-12", descripcion: "Alta de la hija, 12 años." },
    });
    assert.match(m.asunto, /Se realizaron los cambios a tu póliza 0000685925/);
    assert.match(m.mensaje, /se realizaron los cambios correspondientes a tu póliza de GMM Individual con MetLife/);
    assert.match(m.mensaje, /Movimiento aplicado: Alta de asegurado \(endoso E-03\)/);
    assert.match(m.mensaje, /Alta de la hija, 12 años\./);
    assert.match(m.mensaje, /póliza actualizada/);
    assert.match(m.mensaje, /Te adjuntamos la carátula/);
  });

  it("sin endoso registrado no inventa el movimiento", () => {
    const m = mensajeEndoso(base);
    assert.doesNotMatch(m.mensaje, /Movimiento aplicado/);
    assert.match(m.mensaje, /Saludos cordiales\./);
  });
});
