# Escaneo de portales para el multicotizador

El multicotizador pide los datos **una sola vez** y los manda a cada aseguradora. Para diseñar ese
formulario único hay que saber qué pide cada portal. Este documento junta lo que se vio en cada uno.

Mientras llegan las APIs, el robot de la oficina cotiza en estos mismos portales (skill
`cotizador-robot`). Cada portal escaneado sirve para las dos cosas: el formulario y el robot.

**Cómo se escaneó (2026-11-18):** una persona abrió las sesiones en el Chrome de servicio y Claude
recorrió la pantalla de cotizar de cada una **sin guardar, cotizar ni emitir nada**. Por eso de casi
todas se conoce el primer paso (los datos de entrada); los paquetes y coberturas de cada una se ven
hasta presionar «Cotizar», y eso se documentará cuando el robot haga la primera cotización real.

## Resumen

| Aseguradora | Ramo escaneado | Estado | Facilidad para el robot |
|---|---|---|---|
| Qualitas | Autos | ✅ completo, robot funcionando | buena (menús) |
| MetLife | GMM (MédicaLife Familiar) | ✅ cotizado (robot) | buena (formulario normal) |
| GNP | Autos | ✅ cotizado (robot) | medio: abrir el marco como página propia y usar clics reales |
| GNP | GMM (Planes Individuales) | ✅ datos del titular | difícil (mismo marco) |
| GNP | Vida | ⚠️ Plan de Rentas en línea; Vida individual solo con el programa Nautilus | — |
| HDI | Autos | ✅ datos de entrada | media (buscador de texto del auto) |
| Zurich | Autos | ✅ vehículo y pre-cotización | buena (menús), pero lanza avisos emergentes |
| Mapfre | Autos | ✅ paso 1 de 4 | buena (menús y buscador) |
| El Potosí | Autos | ✅ datos de entrada | buena (una sola página) |
| Plan Seguro | GMM | ✅ asegurados | buena |
| Bupa | GMM | ✅ datos de entrada (cotizador público, sin sesión) | media (marco embebido) |
| Assist Card | Viaje | ✅ datos de entrada | buena |
| MetLife | Vida | ❌ no hay cotizador en línea: se descargan cotizadores | — |
| Insignia Life | Vida | ⏳ el «Cotizador Único» pide otro inicio de sesión | — |
| BX+ | Autos, GMMI, Vida | ⏳ piden usuario propio | — |
| GMX | Autos / Daños | ⏳ no hubo sesión de agente | — |
| Afirme | Autos | ✅ cotizado (robot) | medio: marca y tipo con sus menús, luego la versión |
| AXA, ANA, Sura, Atlas, Thona, Aserta | — | ⏳ no se abrieron | — |

---

## Conclusión para el formulario único de Autos

Lo que piden **todas**: año, marca, modelo/versión del auto y código postal. Además:

| Dato | Quién lo pide | Decisión para ZenSecure |
|---|---|---|
| Fecha de nacimiento (o edad) del conductor | GNP*, El Potosí*, Zurich*, Mapfre, HDI | **Pedirla siempre** (hoy es opcional): sin ella GNP y El Potosí no cotizan |
| Sexo del conductor | GNP*, El Potosí*, Zurich* | **Pedirlo siempre** |
| Tipo de persona (física / moral) | GNP*, Zurich*, HDI, El Potosí | Agregar, con física por defecto |
| Tipo de vehículo (auto, pickup, camión, moto) | GNP, Zurich, Mapfre | Agregar, con auto por defecto |
| Procedencia (residente, fronterizo, legalizado) | GNP, Zurich, El Potosí, Mapfre | Agregar, con residente por defecto |
| Uso | todas (particular) | Fijo en particular, como hoy |
| Vigencia (fecha de inicio, anual o multianual) | GNP, El Potosí, Mapfre | Agregar inicio con hoy por defecto, anual |
| Valor del auto (comercial, factura, convenido) | Mapfre, Zurich*, Qualitas | Agregar, con comercial por defecto |
| Municipio | El Potosí, HDI (lo deduce del C.P.) | Deducirlo del código postal |

\* obligatorio en ese portal.

**Cómo se identifica el auto en cada portal:** Qualitas, Zurich y Mapfre usan menús (año → marca →
modelo → versión); GNP, HDI y El Potosí usan un buscador de texto libre. ZenSecure debe guardar año,
marca, modelo y versión por separado, como hoy, y el robot arma la búsqueda de cada portal.

## Conclusión para el formulario único de GMM

| Dato | MetLife | GNP | Plan Seguro | Bupa |
|---|---|---|---|---|
| Asegurados | titular (edad, género) + cónyuge + número de hijos | titular (edad, género, peso, estatura) + hasta 6 familiares | persona por persona: nombre, sexo, fecha de nacimiento, estado | tipo de póliza + edad del titular |
| Ubicación | estado y municipio | código postal | estado | país de residencia |
| Plan | Internacional, Ejecutivo, Más, Básico, Práctico | tipo de plan (nacional…) y plan (p. ej. Personaliza Fija) | Individual y Familiar / Smart | producto (Global Major Medical…) |
| Suma asegurada | en UMAM: 300 a 26,000 o sin límite | en «Elige» | (siguiente paso) | — |
| Deducible | $10,000 a $1,500,000 | en «Elige» | (siguiente paso) | — |
| Coaseguro | 0 % a 30 % | en «Elige» | (siguiente paso) | — |
| Forma de pago | anual, semestral, trimestral, mensual; directo o tarjeta | — | — | descuento por pago fraccionado |
| Adicionales | dental, visión, emergencia en el extranjero, catastróficas, reducción de deducible, protección garantizada, estudiantes, muerte accidental, renta diaria | respaldo por fallecimiento, respaldo hospitalario, maternidad plus, atención en el extranjero; riesgo selecto | — | descuentos especiales |

**Decisión para ZenSecure:** capturar **cada asegurado con nombre, fecha de nacimiento y sexo**
(de ahí se saca la edad para MetLife, GNP y Bupa), más código postal, estado y municipio, peso y estatura del titular (GNP), plan deseado, suma asegurada,
deducible, coaseguro y forma de pago.

---

## Detalle por portal

### Qualitas — Autos
Robot funcionando. Ver el skill `cotizador-robot`: menús Año → Marca → Tipo → Versión, C.P. y colonia,
valor convenido, coberturas con selects, bonificación técnica máxima (35–45 %), Resumen con número de
cotización y PDF oficial.

### MetLife — GMM (Herramientas → Cotizador Línea = «Cotizador GMMI»)
1. Producto (MédicaLife Familiar) y plan (Internacional / Ejecutivo / Más / Básico / Práctico).
2. Información general: tipo de póliza (nueva/renovación), suma asegurada, deducible nacional,
   coaseguro nacional, forma de pago, estado y municipio. Titular: edad y género. Adicionales (casillas),
   incremento de tabulador (100–300 %), último gasto, muerte accidental y renta diaria. Dependientes:
   cónyuge (casilla) y número de hijos.
3. Edad y género del cónyuge y de cada hijo (Hijo u Otro).
4. Resultado en pantalla: prima por asegurado, prima neta, recargo por forma de pago, derecho de póliza,
   IVA y prima total. Sin número de cotización. «Terminar» pide nombre y correo para enviarla al cliente:
   **el robot no lo usa**.
- La suma asegurada va en unidades (SMGMVDF): 1,000 = $3,080,400 al 2026-11-18. Los municipios son
  pocos por estado («Otros Municipios» para el resto).
- Robot funcionando (skill `cotizador-robot`, sección 3h). Prueba: familia de 4 en Zapopan, Plan Más,
  deducible $10,000, coaseguro 10 %, anual: **$59,786.79**.

**Vida:** no hay cotizador en línea; la sección «Producto» ofrece cotizadores descargables. Igual que
GNP (Nautilus): **Vida individual de las dos aseguradoras principales se cotiza con programas
instalables, no en el portal**, así que para Vida el camino es la API.

### GNP — Autos (Herramientas de cotización → Autos → Cotiza)
Flujo: Cotiza → Elige → Contrata → Compra → Imprime. El cotizador vive en un marco de otro dominio:
el robot solo puede trabajarlo con capturas, así que es el más frágil.
- Nombre de negocio* (Fuerza Productora Regular Autos, Alta gama, Flotillas, Micronegocio, RC estatales…).
- Vigencia (hoy a un año, automática).
- Procedencia* (residentes, fronterizos, importados, legalizados, antiguos, blindados, clásicos…), uso
  particular, tipo de vehículo* (automóvil, camiones 1.5 t y 3.5 t, motocicleta), modelo* (año) y
  descripción* (buscador de texto).
- Contratante: tipo de persona* y código postal*; RFC y código de cliente opcionales (descuentos).
- Conductor habitual: fecha de nacimiento* y género*.
- Descuentos: Experiencia GNP, Cliente Integral, Fidelidad. Contacto: nombre y correo.
- Comparativo por producto, por periodicidad de pago o pago en línea con descuento → Cotizar.

También tiene cotizadores de GMM (Tarifa Actual, PyME, Corporativo), Vida y Daños.

### GNP — GMM (Herramientas → GMM → Cotizador GMM Tarifa Actual)
Mismo marco de otro dominio que Autos. Flujo Cotiza → Elige. Negocio operable (Fuerza Productora
Regular), producto (Planes Individuales / GNP Indemniza), tipo de cartera, tipo de cotización (nuevo),
tipo de plan (nacional…) y plan (p. ej. Seguro Médico GNP Personaliza Fija). Titular: nombre opcional,
género, edad*, código postal*, peso y estatura. Opción «Riesgo selecto». Adicionales con costo:
respaldo por fallecimiento, respaldo hospitalario, Maternidad Plus, atención en el extranjero.
Contratante distinto al titular (opcional) y hasta 6 familiares. Suma, deducible y coaseguro en «Elige».
También hay cotizadores de GMM PyME y Corporativo.

### GNP — Vida (Cotiza y emite → Vida)
- **En línea:** Plan de Rentas: nombre del cliente, cotizar por monto a aportar o renta deseada, tipo de
  renta, moneda, edad al inicio de la renta, frecuencia de entrega y monto a aportar (prima única).
  Simuladores (salud en vida, retiro, impuestos, rendimientos) y Vida Grupo para PyMEs.
- **Vida individual tradicional:** solo con **Nautilus**, un programa que se instala en la computadora
  (Windows o Mac) y se actualiza cada mes. El robot de Chrome no puede usarlo: para Vida GNP hace
  falta la API.

### HDI — Autos (SmartOffice → Cotizador de Autos → «Autos Web 3.0» → Cotizar)
Una sola página: agente ya cargado; código postal (estado y municipio); vehículo por placas, «llave» o
descripción con buscador de texto; uso, servicio, remolque, puertas, pasajeros y riesgo de la carga;
canal de venta, tarifa, tipo de persona; datos del conductor. «Calcular cotización» muestra prima neta,
descuento, financiamiento, derecho de póliza, IVA y total. **No usar** Guardar ni Solicitar póliza.
También tiene cotizadores de Daños y GMM.

### Zurich — Autos (Portal de Agentes → Cotización-Emisión → Autos)
Programa comercial (Tu Autoseguro Más, Multianual Más, Antiguos, Fronterizos y legalizados) → tipo
de vehículo → marca → submarca → modelo → Buscar (o búsqueda por clave Zurich). Buscar abre la «Lista
de claves Zurich» con la descripción completa de cada versión (p. ej. 056G6004 MAZDA 3 I TOURING SEDAN
AUT 150HP). Al elegirla, la pre-cotización pide tipo de persona*, edad*, sexo*, esquema de
aseguramiento* (valor comercial, comercial +10 % o convenido), código postal*, moneda, tipo de uso*,
tipo de carga y vigencia (12 meses) → Cotizar. El portal a veces lanza un **aviso emergente** que
congela la pestaña: el robot debe anular los avisos antes de hacer clic. Menú con Autos, Turistas, PyMES y Hogar; GMM tiene un portal nuevo aparte.

### Mapfre — Autos (ZonAliados → Zona de trabajo → Automóviles → Cotiza y Emite Autos)
Cuatro pasos. Paso 1: tipo de vehículo (autos, camiones, pickups, motos), vigencia, clasificación
(residentes / no residentes), año + buscador o menús marca → descripción, uso y valor de la unidad
(comercial, actual, comercial +10 %, factura). Después: datos del conductor.

### El Potosí — Autos (Oficina virtual → Cotizador → Seguro de Automóvil)
Una página: tipo de vigencia (anual / multianual), inicio y fin, municipio de circulación, edad,
género y código postal del conductor, clave del vehículo o año + descripción, legalizado / fronterizo
/ nacionalizado, tipo de uso, persona física o moral, remolques y forma de aseguramiento. También
cotiza Vida Individual.

### Plan Seguro — GMM (Oficina virtual → Emisión digital → Cotizador)
Productos individuales: «Individual y Familiar» o «Producto Smart». Se agrega cada asegurado (titular
primero) con nombre, sexo, fecha de nacimiento y estado. Planes, deducible y coaseguro en los pasos
siguientes. Tiene «Comparativo de planes».

### Bupa — GMM (bupasalud.com.mx/agentes/cotizador, público)
Nombres, apellidos y país; producto; tipo de póliza y edad del titular; descuentos especiales (15 % y
5 %) y por pago fraccionado; datos del agente opcionales.

### Assist Card — Viaje (corporate.assistcard.com)
Tipo de viaje (emisivo, receptivo, doméstico), destino, fechas, modalidad (un viaje o múltiples al año)
y la edad o fecha de nacimiento de cada pasajero. Precios en dólares.

## Plantilla para cada portal nuevo

```
### <Aseguradora> — <ramo>
Portal: <dónde está la pantalla de cotizar>
Pasos: 1. … 2. … 3. …
Campos obligatorios: …
Campos opcionales: …
Catálogos (deducibles, sumas, planes): …
Qué regresa: prima total, desglose, folio, ¿PDF?
Trampas: (avisos emergentes, marcos, tiempos de carga, sesión que expira…)
```
