// Robot cotizador de ZenSecure — versión de oficina, sin Claude.
//
// Se instala en una computadora de la oficina del broker que se queda prendida. Abre su propio
// Chrome (perfil fijo, fuera de OneDrive), donde una persona entra una vez a cada portal. Desde ahí:
//
//   1. Nivel 1: guarda las cookies de sesión cifradas, para que reiniciar no cierre las sesiones.
//   2. Nivel 2: la guardia recarga cada portal antes de que cierre por inactividad.
//   3. Nivel 3: si una sesión se cae, entra solo con las claves guardadas en esta computadora; si no
//      puede (captcha, código por SMS), avisa en Windows y en el CRM.
//
// Mientras tanto pide al CRM las cotizaciones pendientes de los portales con sesión, las cotiza con
// pasos fijos (Playwright) y devuelve el precio. Solo cotiza: nunca emite, paga ni envía nada.
//
// Uso:  npm start          (deja la ventana abierta; Ctrl+C para apagar limpio)

import { chromium } from "playwright-core";

import { DIR_PERFIL, PUERTO_DEPURACION, TIEMPOS, VERSION, leerLlave, prepararCarpetas, urlCrm } from "./lib/config.mjs";
import { registrar, avisarWindows } from "./lib/avisos.mjs";
import { guardarCookiesDeSesion, restaurarCookiesDeSesion } from "./lib/sesiones.mjs";
import { Guardia } from "./lib/guardia.mjs";
import { LlaveInvalida, devolver, pedirTrabajo, reportarEstado, subirPdf } from "./lib/crm.mjs";
import { ErrorCotizacion, SesionCerrada, anularAlertas, esperar } from "./lib/pagina.mjs";
import { PORTALES, porClave } from "./portales/index.mjs";

let apagando = false;

async function abrirChrome() {
  const args = ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"];
  if (PUERTO_DEPURACION) args.push(`--remote-debugging-port=${PUERTO_DEPURACION}`, "--remote-debugging-address=127.0.0.1");
  return chromium.launchPersistentContext(DIR_PERFIL, {
    channel: "chrome",
    headless: false,
    viewport: null,
    acceptDownloads: true,
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    ignoreDefaultArgs: ["--enable-automation"],
    args,
  });
}

/** Cotiza una solicitud en su portal. Devuelve lo que se manda al CRM. */
async function cotizar(context, guardia, solicitud) {
  const portal = porClave(solicitud.aseguradora);
  const fn = portal?.cotizar?.[solicitud.ramo ?? "AUTOS"];
  if (!fn) return { error: `El robot de oficina todavía no sabe cotizar ${solicitud.ramo ?? "AUTOS"} en ${portal?.nombre ?? solicitud.aseguradora}.` };

  for (let intento = 1; intento <= 2; intento++) {
    const page = await context.newPage();
    await anularAlertas(page);
    const limite = setTimeout(() => page.close().catch(() => {}), TIEMPOS.maxCotizacion * 60_000);
    try {
      const salida = await fn(page, solicitud.datos, { solicitud, registrar });
      return salida;
    } catch (e) {
      if (e instanceof SesionCerrada && intento === 1) {
        registrar(`${portal.nombre}: la sesión se cerró a media cotización; la guardia intenta reentrar.`);
        guardia.cambiar(portal, "FUERA", "La sesión se cerró a media cotización.");
        await guardia.ronda({ forzar: [portal.clave] });
        if (guardia.estado(portal.clave).estado === "DENTRO") continue;
      }
      if (e instanceof SesionCerrada) {
        return { error: `La sesión de ${portal.nombre} se cerró y no se pudo volver a entrar: alguien debe entrar al portal en la ventana del robot y pedir la cotización otra vez.` };
      }
      if (e instanceof ErrorCotizacion) return { error: e.message };
      if (page.isClosed()) return { error: `${portal.nombre} tardó más de ${TIEMPOS.maxCotizacion} minutos; se canceló.` };
      registrar(`${portal.nombre}: error inesperado:`, e instanceof Error ? e.stack?.split("\n").slice(0, 3).join(" | ") : e);
      return { error: `El robot falló en ${portal.nombre} (el portal pudo haber cambiado). Avísale a soporte de ZenSecure.` };
    } finally {
      clearTimeout(limite);
      await page.close().catch(() => {});
    }
  }
  return { error: "No se pudo cotizar." };
}

async function principal() {
  prepararCarpetas();
  if (!leerLlave()) {
    console.error("\nFalta la llave del robot. Un administrador la genera en ZenSecure → Multicotizador y se guarda en");
    console.error("%USERPROFILE%\\.zensecure\\robot-cotizador.txt\n");
    process.exit(1);
  }
  registrar(`Robot ZenSecure ${VERSION} arrancando. CRM: ${urlCrm()}`);

  const context = await abrirChrome();
  const restauradas = await restaurarCookiesDeSesion(context);
  if (restauradas) registrar(`Nivel 1: se restauraron ${restauradas} cookies de sesión.`);
  // La pestaña en blanco con que arranca Chrome no sirve: se cierra cuando ya hay otras.
  const enBlanco = context.pages().filter((p) => p.url() === "about:blank");

  let portales = PORTALES;
  const guardia = new Guardia(context, portales);

  const apagar = async () => {
    if (apagando) return;
    apagando = true;
    registrar("Apagando: guardando sesiones…");
    await guardarCookiesDeSesion(context).catch(() => {});
    await context.close().catch(() => {});
    registrar("Robot apagado.");
    process.exit(0);
  };
  process.on("SIGINT", apagar);
  process.on("SIGTERM", apagar);
  context.on("close", () => {
    if (!apagando) {
      registrar("Se cerró la ventana de Chrome del robot. Apagando.");
      apagando = true;
      process.exit(0);
    }
  });

  await guardia.ronda();
  for (const p of enBlanco) if (context.pages().length > 1) await p.close().catch(() => {});

  let ultimaGuardia = Date.now();
  let ultimasCookies = 0;
  let ultimoReporte = 0;

  while (!apagando) {
    try {
      const ahora = Date.now();
      if (ahora - ultimaGuardia >= TIEMPOS.guardia * 1000) {
        await guardia.ronda();
        ultimaGuardia = Date.now();
      }
      if (ahora - ultimasCookies >= TIEMPOS.guardarCookies * 1000) {
        await guardarCookiesDeSesion(context).catch((e) => registrar("No se guardaron las cookies:", e.message));
        ultimasCookies = Date.now();
      }
      if (ahora - ultimoReporte >= TIEMPOS.reportarEstado * 1000) {
        const enRobot = await reportarEstado(guardia.resumen());
        ultimoReporte = Date.now();
        // Si el CRM dice qué aseguradoras tiene la agencia en «Robot», solo se vigilan esas.
        if (enRobot) {
          const nuevos = PORTALES.filter((p) => enRobot.includes(p.clave));
          if (nuevos.map((p) => p.clave).join() !== portales.map((p) => p.clave).join()) {
            portales = nuevos;
            guardia.portales = nuevos;
            for (const p of nuevos) {
              if (!guardia.estados.has(p.clave)) guardia.estados.set(p.clave, { estado: "SIN_REVISAR", desde: new Date(), mensaje: null, ultimoToque: 0, ultimoIntento: 0, claveMala: false, page: null });
            }
            registrar(`Portales a vigilar según el CRM: ${nuevos.map((p) => p.nombre).join(", ") || "ninguno"}.`);
          }
        }
      }

      const sabe = guardia.dentro().filter((k) => Object.keys(porClave(k)?.cotizar ?? {}).length > 0);
      const solicitud = await pedirTrabajo(sabe);
      if (!solicitud) {
        await esperar(TIEMPOS.pedirTrabajo * 1000);
        continue;
      }

      const portal = porClave(solicitud.aseguradora);
      registrar(`Cotizando ${solicitud.id} en ${portal?.nombre ?? solicitud.aseguradora} (${solicitud.ramo ?? "AUTOS"})…`);
      const inicio = Date.now();
      const salida = await cotizar(context, guardia, solicitud);
      const envio = await devolver(solicitud.id, salida.error ? { error: salida.error } : { resultado: salida.resultado });
      const seg = Math.round((Date.now() - inicio) / 1000);
      if (!envio.ok) {
        registrar(`  El CRM no aceptó el resultado de ${solicitud.id}: ${envio.error}`);
      } else if (salida.error) {
        registrar(`  ${solicitud.id}: no se pudo (${seg} s) → ${salida.error}`);
      } else {
        registrar(`  ${solicitud.id}: listo en ${seg} s → $${salida.resultado.primaTotal.toLocaleString("es-MX")}`);
        if (salida.pdf) {
          const r = await subirPdf(solicitud.id, salida.pdf);
          registrar(r.ok ? "  PDF subido al CRM." : `  El PDF no se subió: ${r.error}`);
        }
      }
    } catch (e) {
      if (e instanceof LlaveInvalida) {
        avisarWindows("llave", "Robot ZenSecure detenido", "La llave del robot es inválida o la revocaron. Pide una nueva al administrador.");
        registrar(e.message, "Se detiene el robot.");
        await apagar();
        return;
      }
      registrar("Error en la vuelta del robot:", e instanceof Error ? e.message.split("\n")[0] : e);
      await esperar(30_000);
    }
  }
}

principal().catch((e) => {
  registrar("El robot no pudo arrancar:", e instanceof Error ? e.message : e);
  if (String(e?.message ?? "").includes("user data directory is already in use") || String(e?.message ?? "").includes("ProcessSingleton")) {
    console.error("\nYa hay otro robot (o un Chrome) usando este perfil. Ciérralo antes de arrancar otro.\n");
  }
  process.exit(1);
});
