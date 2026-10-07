const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const numero = new Intl.NumberFormat("es-MX");

const fecha = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMoneda(value: number) {
  return moneda.format(value);
}

export function formatNumero(value: number) {
  return numero.format(value);
}

/** "12.5%", con separador de miles si hace falta ("1,234.5%"). */
export function formatPorcentaje(value: number, digits = 1) {
  return `${value.toLocaleString("es-MX", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

export function formatFecha(value: string | Date) {
  return fecha.format(typeof value === "string" ? new Date(value) : value);
}

/** Fecha de hoy (yyyy-mm-dd) en la zona horaria de la operación. */
export function hoyISO(timeZone = "America/Mexico_City") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/**
 * Instante en que empezó hoy en la zona horaria de la operación (su medianoche, como Date en UTC).
 * Para "lo de hoy" en marcas de tiempo; las fechas sin hora (vencimientos) usan hoyISO.
 */
export function inicioDeHoy(timeZone = "America/Mexico_City") {
  const desfase = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")
    ?.value.replace("GMT", "");
  return new Date(`${hoyISO(timeZone)}T00:00:00${desfase || "Z"}`);
}

/** "María Guadalupe Hernández" → "MH": primera y última palabra que empiezan con letra. */
export function iniciales(nombre: string) {
  const palabras = nombre.trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  const letras = palabras.length > 1 ? palabras[0][0] + palabras[palabras.length - 1][0] : (palabras[0] ?? "?").slice(0, 2);
  return letras.toUpperCase();
}

/** Días entre hoy y una fecha (negativo = en el pasado). */
export function diasDesdeHoy(fechaUtc: Date, hoy = hoyISO()) {
  return Math.round((fechaUtc.getTime() - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}
