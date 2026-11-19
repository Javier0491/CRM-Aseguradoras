// Guardar, borrar y listar las claves de los portales (nivel 3: volver a entrar solo).
//
//   npm run claves -- lista
//   npm run claves -- guardar QUALITAS
//   npm run claves -- borrar QUALITAS
//
// Lo escribe una persona de la oficina en esta misma ventana. La contraseña no se ve al escribirla y
// queda cifrada para este usuario de Windows en esta computadora.

import { createInterface } from "node:readline";

import { prepararCarpetas } from "./lib/config.mjs";
import { hayCifrado } from "./lib/cifrado.mjs";
import { borrarClaves, guardarClaves, portalesConClaves } from "./lib/claves.mjs";
import { PORTALES, porClave } from "./portales/index.mjs";

function preguntar(texto, { secreta = false } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (secreta) {
      rl._writeToOutput = (s) => {
        if (s.includes(texto)) rl.output.write(s);
        else if (s === "\r\n" || s === "\n") rl.output.write(s);
        else rl.output.write("*".repeat(s.length));
      };
    }
    rl.question(texto, (r) => {
      rl.close();
      if (secreta) process.stdout.write("\n");
      resolve(r);
    });
  });
}

async function main() {
  prepararCarpetas();
  const [accion, claveArg] = process.argv.slice(2);
  const clave = String(claveArg ?? "").toUpperCase();
  const nombres = PORTALES.map((p) => p.clave).join(", ");

  if (!hayCifrado) {
    console.log("Guardar claves solo se puede en Windows (se cifran con la protección de datos de Windows).");
    process.exit(1);
  }

  if (accion === "lista") {
    const con = portalesConClaves();
    for (const p of PORTALES) console.log(`${p.nombre.padEnd(14)} ${con.includes(p.clave) ? "✔ claves guardadas" : "— sin claves (hay que entrar a mano)"}`);
    return;
  }

  const portal = porClave(clave);
  if (!portal || !["guardar", "borrar"].includes(accion)) {
    console.log(`Uso:\n  npm run claves -- lista\n  npm run claves -- guardar <PORTAL>\n  npm run claves -- borrar <PORTAL>\nPortales: ${nombres}`);
    process.exit(1);
  }

  if (accion === "borrar") {
    borrarClaves(portal.clave);
    console.log(`Se borraron las claves de ${portal.nombre}.`);
    return;
  }

  if (!portal.entrar || !portal.camposClave?.length) {
    console.log(`${portal.nombre} no permite que el robot entre solo; hay que entrar a mano.`);
    process.exit(1);
  }
  console.log(`\nClaves de ${portal.nombre}. Quedan cifradas en esta computadora y nunca se envían a ZenSecure.\n`);
  const valores = {};
  for (const campo of portal.camposClave) {
    const v = (await preguntar(`${campo.etiqueta}: `, { secreta: campo.secreta })).trim();
    if (!v) {
      console.log("Cancelado: no se guardó nada.");
      process.exit(1);
    }
    valores[campo.clave] = v;
  }
  guardarClaves(portal.clave, valores);
  console.log(`\nListo. Si ${portal.nombre} cierra la sesión, el robot intentará entrar solo.`);
  console.log("Si el robot ya estaba prendido, lo usará en su siguiente intento (a lo más 30 minutos).");
}

main();
