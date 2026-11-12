import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { esRolComercial, esRolSoloTareas, ROLES, ROLES_CARTERA, rolLabels } from "@/lib/usuarios/reglas";

describe("roles del equipo", () => {
  it("el Auxiliar comercial tiene la misma vista que el Ejecutivo comercial", () => {
    assert.ok(ROLES.includes("AUXILIAR_COMERCIAL"));
    assert.equal(rolLabels.AUXILIAR_COMERCIAL, "Auxiliar comercial");
    for (const rol of ["EJECUTIVO", "AUXILIAR_COMERCIAL"]) {
      assert.equal(esRolComercial(rol), true, rol);
      assert.equal(esRolSoloTareas(rol), false, rol);
      assert.ok((ROLES_CARTERA as readonly string[]).includes(rol), rol);
    }
  });

  it("el Auxiliar de Tareas sigue sin acceso al CRM", () => {
    assert.equal(esRolComercial("AUXILIAR"), false);
    assert.equal(esRolSoloTareas("AUXILIAR"), true);
    assert.ok(!(ROLES_CARTERA as readonly string[]).includes("AUXILIAR"));
  });
});
