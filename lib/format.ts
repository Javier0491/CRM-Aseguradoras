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

export function formatPorcentaje(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

export function formatFecha(value: string | Date) {
  return fecha.format(typeof value === "string" ? new Date(value) : value);
}

/** Fecha de hoy (yyyy-mm-dd) en la zona horaria de la operación. */
export function hoyISO(timeZone = "America/Mexico_City") {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** Días entre hoy y una fecha (negativo = en el pasado). */
export function diasDesdeHoy(fechaUtc: Date, hoy = hoyISO()) {
  return Math.round((fechaUtc.getTime() - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}
