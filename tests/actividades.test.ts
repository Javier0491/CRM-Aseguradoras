import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { leerActividades, tituloActividad, validarActividad } from "@/lib/tareas/actividades";

describe("actividades de póliza", () => {
  it("el título es el tipo; en «Otro», el comentario", () => {
    assert.equal(tituloActividad("cambio_agente", "pedir la clave 15521"), "Cambio de agente");
    assert.equal(tituloActividad("otro", "  Llevar   la póliza firmada "), "Llevar la póliza firmada");
    assert.equal(tituloActividad("otro", "x".repeat(200)).length, 140);
  });
  it("piden tipo, y en «Otro» qué hay que hacer", () => {
    assert.equal(validarActividad({ tipo: "", comentario: "algo" }), "Elige el tipo de actividad.");
    assert.equal(validarActividad({ tipo: "otro", comentario: " " }), "Escribe qué hay que hacer.");
    assert.equal(validarActividad({ tipo: "cambio_agente", comentario: "" }), null);
  });
  it("lee las del formulario y rechaza las inválidas", () => {
    assert.deepEqual(leerActividades(undefined), []);
    assert.deepEqual(leerActividades([{ tipo: "cambio_agente", comentario: " a la clave 15521 " }]), [
      { tipo: "cambio_agente", comentario: "a la clave 15521" },
    ]);
    assert.deepEqual(leerActividades([{ tipo: "endoso" }]), [{ tipo: "endoso", comentario: "" }]);
    assert.equal(leerActividades([{ tipo: "inventado", comentario: "" }]), null);
    assert.equal(leerActividades([{ tipo: "otro", comentario: "" }]), null);
    assert.equal(leerActividades("no es lista"), null);
    assert.equal(leerActividades(Array.from({ length: 11 }, () => ({ tipo: "endoso" }))), null);
  });
});
