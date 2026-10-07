import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
