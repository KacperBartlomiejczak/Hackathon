// The analyst thinks in local (Polish) days; the api works in UTC timestamps (issue #88).

/** Local calendar day (YYYY-MM-DD) of an ISO timestamp. */
export function toLocalDay(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** UTC timestamp of the first millisecond of a local day. */
export function localDayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

/** UTC timestamp of the last millisecond of a local day. */
export function localDayEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

/** Query value for a filter key: from/to become local-day boundaries, the rest stays as is. */
export function filterQueryValue(key: string, value: string | number): string {
  if (key === "from" && typeof value === "string") return localDayStartIso(value);
  if (key === "to" && typeof value === "string") return localDayEndIso(value);
  return String(value);
}
