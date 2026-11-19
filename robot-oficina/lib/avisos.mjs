// Bitácora y avisos del robot.
//
// - registrar(): consola + robot.log. Nunca se escriben datos de clientes ni claves: solo qué
//   aseguradora, qué id de solicitud y qué pasó.
// - avisarWindows(): globo de notificación en la computadora de la oficina (p. ej. «Qualitas pide
//   volver a entrar»), sin repetir el mismo aviso antes de TIEMPOS.repetirAviso.

import { appendFileSync, statSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";

import { ARCHIVO_LOG, TIEMPOS } from "./config.mjs";

const MAX_LOG = 5 * 1024 * 1024;

function rotar() {
  try {
    if (statSync(ARCHIVO_LOG).size > MAX_LOG) renameSync(ARCHIVO_LOG, ARCHIVO_LOG + ".anterior");
  } catch {
    // sin archivo todavía
  }
}

export function registrar(...partes) {
  const linea = `[${new Date().toLocaleString("es-MX", { hour12: false })}] ${partes.join(" ")}`;
  console.log(linea);
  try {
    rotar();
    appendFileSync(ARCHIVO_LOG, linea + "\n");
  } catch {
    // la bitácora nunca debe tumbar al robot
  }
}

const ultimos = new Map();

/** Globo de Windows. `clave` agrupa avisos iguales para no repetirlos. */
export function avisarWindows(clave, titulo, texto) {
  const ahora = Date.now();
  if (ultimos.has(clave) && ahora - ultimos.get(clave) < TIEMPOS.repetirAviso * 60_000) return;
  ultimos.set(clave, ahora);
  registrar("AVISO", titulo, "-", texto);
  if (process.platform !== "win32") return;
  const limpiar = (s) => String(s).replace(/'/g, "''").slice(0, 240);
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.ShowBalloonTip(15000, '${limpiar(titulo)}', '${limpiar(texto)}', 'Warning')
Start-Sleep -Seconds 16
$n.Dispose()`;
  try {
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], {
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    });
    p.unref();
  } catch {
    // sin globo, queda en la bitácora
  }
}

/** Quita el registro de un aviso para que, si vuelve a pasar, se avise de inmediato. */
export function olvidarAviso(clave) {
  ultimos.delete(clave);
}
