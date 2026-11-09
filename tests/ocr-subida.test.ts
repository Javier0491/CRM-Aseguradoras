import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claveOcr, claveOcrValida } from "@/lib/ocr/subida";

const agencia = "0b6c2f3e-1d4a-4c8e-9f00-123456789abc";

describe("documentos de la lectura con IA subidos al almacenamiento", () => {
  it("acepta la clave que genera para su agencia y tipo", () => {
    const clave = claveOcr(agencia, "application/pdf");
    assert.match(clave, /^ocr-temporal\/.+\.pdf$/);
    assert.ok(claveOcrValida(clave, agencia, "application/pdf"));
    assert.ok(claveOcrValida(claveOcr(agencia, "image/jpeg"), agencia, "image/jpeg"));
  });

  it("rechaza claves de otra agencia, de otro tipo o fuera de su carpeta", () => {
    const clave = claveOcr(agencia, "application/pdf");
    assert.ok(!claveOcrValida(clave, "otra-agencia", "application/pdf"));
    assert.ok(!claveOcrValida(clave, agencia, "image/png"));
    assert.ok(!claveOcrValida(clave, agencia, "application/zip"));
    assert.ok(!claveOcrValida(`chat/${agencia}/x.pdf`, agencia, "application/pdf"));
    assert.ok(!claveOcrValida(`ocr-temporal/${agencia}/../${agencia}/a.pdf`, agencia, "application/pdf"));
    assert.ok(!claveOcrValida(null, agencia, "application/pdf"));
  });
});
