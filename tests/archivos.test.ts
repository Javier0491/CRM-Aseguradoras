import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BYTES_FIRMA, firmaValida, validarArchivo } from "@/lib/archivos/config";

const bytes = (...b: number[]) => new Uint8Array(b);

describe("firma de los archivos de la póliza", () => {
  it("ZIP normal, vacío y con la marca de un solo volumen (expedientes de los portales)", () => {
    assert.ok(firmaValida("expediente", bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0)));
    assert.ok(firmaValida("expediente", bytes(0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0)));
    // Así empieza el expediente de una póliza de grupo descargado del portal: PK 07 08 y luego PK 03 04.
    assert.ok(firmaValida("expediente", bytes(0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x03, 0x04)));
  });

  it("rechaza lo que no es ZIP, aunque empiece con PK 07 08", () => {
    assert.ok(!firmaValida("expediente", bytes(0x50, 0x4b, 0x07, 0x08, 0, 0, 0, 0)));
    assert.ok(!firmaValida("expediente", bytes(0x25, 0x50, 0x44, 0x46)));
    assert.ok(!firmaValida("caratula", bytes(0x50, 0x4b, 0x03, 0x04)));
  });

  it("lee del archivo los bytes que hacen falta para la firma más larga", async () => {
    assert.equal(BYTES_FIRMA, 8);
    const zip = new File([bytes(0x50, 0x4b, 0x07, 0x08, 0x50, 0x4b, 0x03, 0x04, 0x14, 0)], "02001_M0076486.zip");
    assert.equal(await validarArchivo("expediente", zip), null);
  });
});
