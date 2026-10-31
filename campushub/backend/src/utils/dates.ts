export const DAY_MS = 86_400_000;

export const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000);
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Monday of the week (UTC) as YYYY-MM-DD — used to group weekly goals. */
export function weekStart(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

export const daysUntil = (deadline: Date, now = new Date()) => Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
