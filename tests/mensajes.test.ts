import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claveAdjunto,
  claveAdjuntoValida,
  formatoBytes,
  nombreAdjunto,
  TIPOS_ADJUNTO,
  tipoDeAdjunto,
} from "@/lib/mensajes/adjuntos";
import {
  agruparMensajes,
  claveDirecta,
  MAX_TEXTO_MENSAJE,
  partesConEnlaces,
  unirMensajes,
  validarTextoMensaje,
  type MensajeChat,
} from "@/lib/mensajes/reglas";

const msg = (id: string, autorId: string, at: string, texto = "hola"): MensajeChat => ({
  id,
  autorId,
  autor: autorId,
  texto,
  at,
  eliminado: false,
  adjunto: null,
});

describe("chat del equipo", () => {
  it("una sola conversación directa por pareja, sin importar quién la inicia", () => {
    assert.deepEqual(claveDirecta("b", "a"), claveDirecta("a", "b"));
    assert.deepEqual(claveDirecta("u2", "u1"), { clave: "dm:u1:u2", usuarioAId: "u1", usuarioBId: "u2" });
  });

  it("valida y limpia el texto", () => {
    assert.deepEqual(validarTextoMensaje("  hola\r\n\r\n\r\n\r\nadiós  "), { ok: true, texto: "hola\n\nadiós" });
    assert.equal(validarTextoMensaje("   ").ok, false);
    assert.equal(validarTextoMensaje(42).ok, false);
    assert.equal(validarTextoMensaje("x".repeat(MAX_TEXTO_MENSAJE)).ok, true);
    assert.equal(validarTextoMensaje("x".repeat(MAX_TEXTO_MENSAJE + 1)).ok, false);
  });

  it("separa por día (hora de México) y agrupa los mensajes seguidos del mismo autor", () => {
    const lista = agruparMensajes(
      [
        msg("1", "ana", "2026-10-05T23:00:00.000Z"), // 5 oct, 17:00 en México
        msg("2", "ana", "2026-10-06T05:30:00.000Z"), // 5 oct, 23:30: mismo día, pero pasó un rato
        msg("3", "ana", "2026-10-06T06:10:00.000Z"), // 6 oct, 00:10: día nuevo
        msg("4", "ana", "2026-10-06T06:12:00.000Z"),
        msg("5", "luis", "2026-10-06T06:13:00.000Z"),
      ],
      "2026-10-06"
    );
    assert.deepEqual(
      lista.map((m) => [m.dia, m.inicioGrupo]),
      [
        ["Ayer", true],
        [null, true],
        ["Hoy", true],
        [null, false],
        [null, true],
      ]
    );
  });

  it("une la página reciente con lo que ya se tenía, sin repetir y en orden", () => {
    const viejos = [msg("a", "ana", "2026-10-06T10:00:00.000Z"), msg("b", "ana", "2026-10-06T10:01:00.000Z")];
    const recientes = [{ ...msg("b", "ana", "2026-10-06T10:01:00.000Z"), eliminado: true, texto: "" }, msg("c", "luis", "2026-10-06T10:02:00.000Z")];
    const unidos = unirMensajes(viejos, recientes);
    assert.deepEqual(unidos.map((m) => m.id), ["a", "b", "c"]);
    assert.equal(unidos[1].eliminado, true);
  });

  it("detecta enlaces sin incluir la puntuación final", () => {
    assert.deepEqual(partesConEnlaces("Mira https://ejemplo.mx/a?b=1. Gracias"), [
      { texto: "Mira ", enlace: false },
      { texto: "https://ejemplo.mx/a?b=1", enlace: true },
      { texto: ". Gracias", enlace: false },
    ]);
    assert.deepEqual(partesConEnlaces("sin enlaces"), [{ texto: "sin enlaces", enlace: false }]);
    // Un javascript: nunca se vuelve enlace.
    assert.deepEqual(partesConEnlaces("javascript:alert(1)"), [{ texto: "javascript:alert(1)", enlace: false }]);
  });
});

describe("adjuntos del chat", () => {
  it("el tipo sale de la extensión (cada sistema reporta tipos distintos)", () => {
    assert.equal(tipoDeAdjunto("cartera.CSV", "application/vnd.ms-excel"), "text/csv");
    assert.equal(tipoDeAdjunto("foto.JPEG", ""), "image/jpeg");
    assert.equal(tipoDeAdjunto("expediente.zip", "application/x-zip-compressed"), "application/zip");
    assert.equal(tipoDeAdjunto("pagina.html", "text/html"), null);
    assert.equal(tipoDeAdjunto("dibujo.svg", "image/svg+xml"), null);
    assert.equal(tipoDeAdjunto("captura", "image/png"), "image/png");
  });

  it("la firma real del archivo debe corresponder a su tipo", () => {
    const bytes = (...b: number[]) => Uint8Array.from(b);
    assert.equal(TIPOS_ADJUNTO["application/pdf"].firma(bytes(0x25, 0x50, 0x44, 0x46, 0x2d)), true);
    assert.equal(TIPOS_ADJUNTO["application/pdf"].firma(bytes(0x3c, 0x68, 0x74, 0x6d)), false);
    assert.equal(TIPOS_ADJUNTO["image/png"].firma(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), true);
    assert.equal(TIPOS_ADJUNTO["image/jpeg"].firma(bytes(0x89, 0x50, 0x4e, 0x47)), false);
    const webp = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ");
    assert.equal(TIPOS_ADJUNTO["image/webp"].firma(webp), true);
    assert.equal(TIPOS_ADJUNTO["text/csv"].firma(new TextEncoder().encode("poliza,comision\n1,2")), true);
    assert.equal(TIPOS_ADJUNTO["text/csv"].firma(bytes(0x50, 0x4b, 0x00, 0x04)), false);
  });

  it("nombres seguros y con su extensión", () => {
    assert.equal(nombreAdjunto("C:\\Users\\ana\\Escritorio\\carátula.pdf"), "carátula.pdf");
    assert.equal(nombreAdjunto("../../etc/passwd"), "passwd");
    assert.equal(nombreAdjunto('reporte<>:"|?*.xlsx'), "reporte.xlsx");
    const largo = nombreAdjunto(`${"a".repeat(300)}.pdf`);
    assert.equal(largo.length, 120);
    assert.ok(largo.endsWith(".pdf"));
    assert.equal(nombreAdjunto(""), "archivo");
  });

  it("solo se aceptan claves del chat de la propia agencia y del tipo indicado", () => {
    const agencia = "00000000-0000-4000-8000-000000000001";
    const clave = claveAdjunto(agencia, "application/pdf");
    assert.match(clave, /^chat\/00000000-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.pdf$/);
    assert.equal(claveAdjuntoValida(clave, agencia, "application/pdf"), true);
    assert.equal(claveAdjuntoValida(clave, "11111111-1111-4111-8111-111111111111", "application/pdf"), false);
    assert.equal(claveAdjuntoValida(clave, agencia, "image/png"), false);
    assert.equal(claveAdjuntoValida("polizaabc/123.pdf", agencia, "application/pdf"), false);
    assert.equal(claveAdjuntoValida(`${clave}/../otro.pdf`, agencia, "application/pdf"), false);
  });

  it("un mensaje con archivo puede ir sin texto", () => {
    assert.equal(validarTextoMensaje("  ").ok, false);
    assert.deepEqual(validarTextoMensaje("  ", { conAdjunto: true }), { ok: true, texto: "" });
    assert.equal(formatoBytes(512), "512 B");
    assert.equal(formatoBytes(350 * 1024), "350 KB");
    assert.equal(formatoBytes(19_876_543), "19 MB");
  });
});
