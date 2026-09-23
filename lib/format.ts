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

export function formatFecha(iso: string) {
  return fecha.format(new Date(iso));
}
