# Robot cotizador de oficina (ZenSecure)

Programa que cotiza en los portales de las aseguradoras **desde una computadora de la oficina de cada
broker**, con pasos fijos (Playwright) y sin Claude. Las claves de los portales nunca salen de esa
computadora.

## Cómo funciona

1. Abre su propio Chrome (perfil en `%LOCALAPPDATA%\ZenSecure\robot`, fuera de OneDrive).
2. Una persona entra una vez a cada portal en esa ventana.
3. El robot cuida las sesiones:
   - **Nivel 1:** guarda las cookies de sesión cifradas (DPAPI de Windows), así reiniciar no las cierra.
   - **Nivel 2:** recarga cada portal antes de que lo cierre por inactividad (Qualitas: cada 10 min).
   - **Nivel 3:** si una sesión se cae, entra solo con las claves guardadas en esta computadora. Si el
     portal pide captcha o código, avisa con un globo de Windows (y en el CRM, cuando exista
     `/api/cotizador/robot/estado`).
4. Pide al CRM las cotizaciones de los portales con sesión, las cotiza y devuelve el precio.
   **Solo cotiza: nunca emite, paga ni envía nada.**

## Instalar (computadora con Windows y Google Chrome)

1. Instalar Node.js 20 o más nuevo.
2. En esta carpeta: `npm install`.
3. Guardar la llave del robot (ZenSecure → Multicotizador → «Generar llave») en
   `%USERPROFILE%\.zensecure\robot-cotizador.txt`.
4. Opcional, para el nivel 3: `npm run claves -- guardar QUALITAS` (pide clave de agente, cuenta y
   contraseña; la contraseña no se ve al escribirla).
5. `npm start` y dejar la ventana abierta. Ctrl+C la apaga guardando las sesiones.

## Portales

| Portal | Sesión (niveles 1-3) | Cotiza |
|---|---|---|
| Qualitas | ✅ | pendiente: falta escribir los pasos con la sesión abierta |

Mientras un portal no cotice aquí, el skill `cotizador-robot` de Claude lo sigue cubriendo: este robot
solo pide al CRM las aseguradoras que sabe cotizar.

Para agregar un portal: `portales/<nombre>.mjs` con la forma descrita en `portales/index.mjs`.
