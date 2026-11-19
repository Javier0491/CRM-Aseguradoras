// Qualitas — portal Agentes 360 (Liferay).
//
// Entrada: clave de agente + cuenta + contraseña, con reCAPTCHA Enterprise invisible. Si Google
// decide pedir que se resuelva el captcha, el robot NO lo resuelve: avisa para que entre una persona.
// La sesión expira por inactividad en menos de una hora (visto el 2026-11-17): se toca cada 10 min.

const BASE = "https://agentes360.qualitas.com.mx";
const ID = "_com_liferay_login_web_portlet_LoginPortlet_";

async function hayLogin(page) {
  if (page.url().includes("LoginPortlet")) return true;
  return page
    .locator(`#${ID}password`)
    .isVisible()
    .catch(() => false);
}

async function estaDentro(page) {
  const url = page.url();
  if (!url.startsWith(BASE)) return false;
  if (await hayLogin(page)) return false;
  const expiro = await page
    .getByText("La sesión expiró", { exact: false })
    .first()
    .isVisible()
    .catch(() => false);
  return !expiro && url.includes("/group/guest/");
}

export default {
  clave: "QUALITAS",
  nombre: "Qualitas",
  urlGuardia: `${BASE}/group/guest/inicio`,
  mantenerCadaMin: 10,
  esperaCarga: 8000,
  estaDentro,

  async mantener(page) {
    await page.goto(this.urlGuardia, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(this.esperaCarga);
    return estaDentro(page);
  },

  camposClave: [
    { clave: "agente", etiqueta: "Clave de agente" },
    { clave: "cuenta", etiqueta: "Cuenta" },
    { clave: "contrasena", etiqueta: "Contraseña", secreta: true },
  ],

  async entrar(page, claves) {
    if (!claves.agente || !claves.cuenta || !claves.contrasena) {
      return { ok: false, motivo: "CLAVE", mensaje: "Faltan datos en las claves guardadas de Qualitas." };
    }
    await page.goto(this.urlGuardia, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(this.esperaCarga);
    if (await estaDentro(page)) return { ok: true };
    if (!(await hayLogin(page))) return { ok: false, motivo: "OTRO", mensaje: "No apareció la pantalla de entrada de Qualitas." };

    // Se escribe tecla por tecla como una persona: el reCAPTCHA invisible califica el comportamiento.
    for (const [campo, valor] of [["login", claves.agente], ["account", claves.cuenta], ["password", claves.contrasena]]) {
      const input = page.locator(`#${ID}${campo}`);
      await input.click();
      await input.fill("");
      await input.pressSequentially(String(valor), { delay: 60 + Math.random() * 60 });
      await page.waitForTimeout(300 + Math.random() * 400);
    }
    await page.locator(`#${ID}loginButton`).click();

    // Esperar a que entre, a que diga que no, o a que Google pida el captcha.
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      if (await estaDentro(page)) return { ok: true };
      const reto = await page
        .locator('iframe[src*="recaptcha"][src*="bframe"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (reto) return { ok: false, motivo: "CAPTCHA", mensaje: "Qualitas pidió resolver el captcha: hay que entrar a mano." };
      const error = await page
        .locator(".alert-danger, .portlet-msg-error")
        .first()
        .innerText()
        .catch(() => "");
      if (error.trim()) {
        const esClave = /autenticaci|contrase|password|credencial|usuario/i.test(error);
        return {
          ok: false,
          motivo: esClave ? "CLAVE" : "OTRO",
          mensaje: `Qualitas dijo: «${error.trim().slice(0, 140)}»`,
        };
      }
    }
    return { ok: false, motivo: "OTRO", mensaje: "Qualitas no terminó de entrar en 30 segundos." };
  },

  cotizar: {},
};
