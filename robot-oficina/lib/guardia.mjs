// NIVELES 2 y 3 — la guardia de sesiones.
//
// Cada portal tiene una «pestaña de guardia» abierta en el Chrome del robot. Cada minuto la guardia
// revisa los portales:
//
//  - DENTRO y ya le toca (cada `mantenerCadaMin`): recarga una página inofensiva del portal para que
//    no cierre la sesión por inactividad (nivel 2). Si al recargar ya no está dentro, pasa a FUERA.
//  - FUERA: si hay claves guardadas, intenta entrar sola (nivel 3), a lo más una vez cada
//    `MIN_ENTRE_INTENTOS`; si el portal dice que la clave está mal, deja de intentar para no bloquear
//    la cuenta. Si no puede (sin claves, captcha, código por SMS…) avisa en Windows y en el CRM, y
//    espera a que una persona entre en esa misma pestaña. No recarga la pestaña mientras está FUERA,
//    para no borrarle lo que esté escribiendo.

import { avisarWindows, olvidarAviso, registrar } from "./avisos.mjs";
import { fechaClaves, leerClaves } from "./claves.mjs";
import { anularAlertas } from "./pagina.mjs";

const MIN_ENTRE_INTENTOS = 30;

export class Guardia {
  constructor(context, portales) {
    this.context = context;
    this.portales = portales;
    /** clave → { estado, desde, mensaje, ultimoToque, ultimoIntento, claveMala, page } */
    this.estados = new Map(portales.map((p) => [p.clave, { estado: "SIN_REVISAR", desde: new Date(), mensaje: null, ultimoToque: 0, ultimoIntento: 0, claveMala: false, page: null }]));
  }

  estado(clave) {
    return this.estados.get(clave);
  }

  /** Aseguradoras con sesión abierta: solo de esas se piden cotizaciones. */
  dentro() {
    return this.portales.filter((p) => this.estado(p.clave).estado === "DENTRO").map((p) => p.clave);
  }

  /** Para el CRM: [{ aseguradora, estado, desde, mensaje, entraSola }]. */
  resumen() {
    return this.portales.map((p) => {
      const e = this.estado(p.clave);
      return {
        aseguradora: p.clave,
        estado: e.estado,
        desde: e.desde.toISOString(),
        mensaje: e.mensaje,
        entraSola: Boolean(p.entrar && leerClaves(p.clave) && !e.claveMala),
      };
    });
  }

  async pestana(portal) {
    const e = this.estado(portal.clave);
    if (!e.page || e.page.isClosed()) {
      e.page = await this.context.newPage();
      await anularAlertas(e.page);
      await e.page.goto(portal.urlGuardia, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
      await e.page.waitForTimeout(portal.esperaCarga ?? 4000);
      e.ultimoToque = 0;
    }
    return e.page;
  }

  cambiar(portal, estado, mensaje = null) {
    const e = this.estado(portal.clave);
    if (e.estado !== estado) {
      registrar(`${portal.nombre}: ${e.estado} → ${estado}${mensaje ? ` (${mensaje})` : ""}`);
      e.desde = new Date();
    }
    e.estado = estado;
    e.mensaje = mensaje;
    if (estado === "DENTRO") olvidarAviso(`fuera-${portal.clave}`);
  }

  /** Una vuelta de guardia por todos los portales. `forzar` revisa aunque no le toque. */
  async ronda({ forzar = [] } = {}) {
    for (const portal of this.portales) {
      try {
        await this.revisar(portal, forzar.includes(portal.clave));
      } catch (e) {
        registrar(`${portal.nombre}: la guardia falló:`, e instanceof Error ? e.message.split("\n")[0] : e);
      }
    }
  }

  async revisar(portal, forzar) {
    const e = this.estado(portal.clave);
    const ahora = Date.now();
    const page = await this.pestana(portal);

    if (e.estado === "DENTRO" || e.estado === "SIN_REVISAR") {
      const toca = forzar || e.estado === "SIN_REVISAR" || ahora - e.ultimoToque >= portal.mantenerCadaMin * 60_000;
      if (!toca) return;
      // Nivel 2: tocar el portal para que no cierre la sesión por inactividad.
      const sigue = await portal.mantener(page);
      e.ultimoToque = Date.now();
      if (sigue) return this.cambiar(portal, "DENTRO");
      this.cambiar(portal, "FUERA", "La sesión se cerró.");
    }

    // FUERA: ¿ya entró alguien a mano en la pestaña de guardia?
    if (await portal.estaDentro(page)) {
      e.ultimoToque = Date.now();
      return this.cambiar(portal, "DENTRO");
    }

    // Nivel 3: volver a entrar solo con las claves guardadas. Si alguien las volvió a guardar después
    // de un rechazo, se vuelve a intentar de inmediato.
    const fecha = fechaClaves(portal.clave);
    if (fecha !== e.fechaClaves) {
      if (e.claveMala || e.fechaClaves) e.ultimoIntento = 0;
      e.claveMala = false;
      e.fechaClaves = fecha;
    }
    const claves = portal.entrar ? leerClaves(portal.clave) : null;
    if (claves && !e.claveMala && (forzar || ahora - e.ultimoIntento >= MIN_ENTRE_INTENTOS * 60_000)) {
      e.ultimoIntento = ahora;
      registrar(`${portal.nombre}: intentando volver a entrar con las claves guardadas…`);
      const r = await portal.entrar(page, claves);
      if (r.ok) {
        e.ultimoToque = Date.now();
        registrar(`${portal.nombre}: volvió a entrar solo.`);
        return this.cambiar(portal, "DENTRO");
      }
      if (r.motivo === "CLAVE") e.claveMala = true;
      this.cambiar(portal, "FUERA", r.mensaje);
    }

    const como = !portal.entrar
      ? "Este portal no permite entrar solo."
      : !claves
        ? "No hay claves guardadas para entrar solo."
        : e.claveMala
          ? "La clave guardada no funcionó: vuelve a guardarla."
          : (e.mensaje ?? "No se pudo entrar solo.");
    if (e.estado !== "FUERA") this.cambiar(portal, "FUERA", como);
    else e.mensaje = como;
    avisarWindows(
      `fuera-${portal.clave}`,
      `${portal.nombre}: hay que volver a entrar`,
      `Entra a ${portal.nombre} en la ventana del robot ZenSecure. ${como}`
    );
  }
}
