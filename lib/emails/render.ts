import "server-only";

import { render } from "@react-email/components";
import { createElement } from "react";

import { NotificacionCrm, type NotificacionCrmProps } from "@/components/emails/notificacion-crm";

/** HTML listo para el envío (el `contenidoHtml` de Resend) y su versión en texto plano. */
export async function renderNotificacionCrm(props: NotificacionCrmProps) {
  const elemento = createElement(NotificacionCrm, props);
  const [html, texto] = await Promise.all([render(elemento), render(elemento, { plainText: true })]);
  return { html, texto };
}
