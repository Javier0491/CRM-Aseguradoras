import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { colorTextoSobre, normalizarHex } from "@/lib/color";

export type NotificacionCrmProps = {
  /** Nombre del CRM o agencia que envía (p. ej. "PJ Magnus Seguros"). */
  nombreCrm: string;
  /** Color de marca en hexadecimal: botón y acentos. */
  colorTema: string;
  /** Logo por https (PNG o JPG); sin él se muestra el nombre del CRM. */
  logoUrl?: string | null;
  nombreUsuario: string;
  tituloNotificacion: string;
  /** Texto plano; cada salto de línea empieza un párrafo. */
  mensajePrincipal: string;
  /** Destino del botón "Ver detalles"; sin él, el botón no se muestra. */
  urlDetalles?: string;
};

const COLOR_PREDETERMINADO = "#18181B";
/** Alto máximo del logo del encabezado, en px. */
const ALTO_LOGO = 110;
const FUENTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Plantilla base de los correos de notificación de cualquier CRM de Atelier Zenith: la marca
 * (nombre, color y logo) llega por props. Se convierte a HTML con renderNotificacionCrm().
 */
export function NotificacionCrm({
  nombreCrm,
  colorTema,
  logoUrl,
  nombreUsuario,
  tituloNotificacion,
  mensajePrincipal,
  urlDetalles,
}: NotificacionCrmProps) {
  const color = normalizarHex(colorTema) ?? COLOR_PREDETERMINADO;
  const logo = logoUrl?.startsWith("https://") ? logoUrl : null;
  const parrafos = mensajePrincipal.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const enlace = urlDetalles && /^https?:\/\//i.test(urlDetalles) ? urlDetalles : null;

  return (
    <Html lang="es">
      <Head />
      <Preview>{tituloNotificacion}</Preview>
      <Body style={{ margin: 0, padding: "24px 12px", backgroundColor: "#F4F4F5", fontFamily: FUENTE }}>
        <Container style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
          <Section style={{ padding: "8px 8px 20px", textAlign: "center" }}>
            {logo ? (
              // Alto y ancho automáticos con topes: el logo conserva su proporción sea cuadrado o alargado.
              // El atributo height es para Outlook de escritorio, que ignora max-height.
              <Img
                src={logo}
                alt={nombreCrm}
                height={ALTO_LOGO}
                style={{ height: "auto", width: "auto", maxHeight: ALTO_LOGO, maxWidth: "100%", margin: "0 auto" }}
              />
            ) : (
              <Text style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "0.3px", color: "#18181B" }}>
                {nombreCrm}
              </Text>
            )}
          </Section>

          <Section
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E4E4E7",
              borderTop: `4px solid ${color}`,
              borderRadius: 16,
              padding: "32px 28px",
            }}
          >
            <Heading as="h1" style={{ margin: "0 0 20px", fontSize: 22, lineHeight: "30px", fontWeight: 700, color: "#18181B" }}>
              {tituloNotificacion}
            </Heading>
            <Text style={{ margin: "0 0 14px", fontSize: 15, lineHeight: "24px", color: "#3F3F46" }}>
              Hola, {nombreUsuario}:
            </Text>
            {parrafos.map((p, i) => (
              <Text key={i} style={{ margin: "0 0 14px", fontSize: 15, lineHeight: "24px", color: "#3F3F46" }}>
                {p}
              </Text>
            ))}
            {enlace && (
              <Section style={{ padding: "14px 0 4px", textAlign: "center" }}>
                <Button
                  href={enlace}
                  style={{
                    backgroundColor: color,
                    color: colorTextoSobre(color),
                    borderRadius: 10,
                    padding: "13px 28px",
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Ver detalles
                </Button>
              </Section>
            )}
          </Section>

          <Section style={{ padding: "20px 8px 0", textAlign: "center" }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: "#71717A" }}>
              © {new Date().getFullYear()} {nombreCrm}. Todos los derechos reservados.
            </Text>
            <Hr style={{ margin: "16px 0 12px", borderColor: "#E4E4E7" }} />
            <Text style={{ margin: 0, fontSize: 11, lineHeight: "16px", color: "#A1A1AA" }}>
              Sistema impulsado por Atelier Zenith
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
