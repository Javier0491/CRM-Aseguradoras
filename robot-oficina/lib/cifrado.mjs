// Cifrado con la protección de datos de Windows (DPAPI), atada al usuario de Windows de esta
// computadora: lo que se cifra aquí solo lo puede descifrar el mismo usuario en la misma máquina.
// Si alguien copia el archivo a otra computadora (o lo sube OneDrive), no le sirve.
//
// Se usa para las cookies de sesión (nivel 1) y las claves de los portales (nivel 3).

import { execFileSync } from "node:child_process";

const SCRIPT = (accion) => `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$entrada = [Console]::In.ReadToEnd().Trim()
$bytes = [Convert]::FromBase64String($entrada)
$salida = [System.Security.Cryptography.ProtectedData]::${accion}($bytes, [Text.Encoding]::UTF8.GetBytes('ZenSecure-robot'), 'CurrentUser')
[Console]::Out.Write([Convert]::ToBase64String($salida))
`;

export const hayCifrado = process.platform === "win32";

function powershell(accion, base64) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT(accion)],
    { input: base64, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }
  ).trim();
}

/** Texto → cadena cifrada (base64). */
export function cifrar(texto) {
  if (!hayCifrado) throw new Error("El cifrado de claves solo existe en Windows.");
  return powershell("Protect", Buffer.from(texto, "utf8").toString("base64"));
}

/** Cadena cifrada (base64) → texto. Lanza si no es de este usuario/computadora. */
export function descifrar(cifrado) {
  if (!hayCifrado) throw new Error("El cifrado de claves solo existe en Windows.");
  return Buffer.from(powershell("Unprotect", cifrado), "base64").toString("utf8");
}
