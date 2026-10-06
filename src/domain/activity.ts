export const activityRoutes = [
  "today",
  "studies",
  "reviews",
  "materials",
  "agenda",
  "progress",
  "mentor",
  "settings",
  "profile",
  "focus",
] as const;
export type ActivityRoute = (typeof activityRoutes)[number];
export interface ActivityDay {
  date: string;
  route: ActivityRoute;
  visits: number;
  activeSeconds: number;
  backgrounds: number;
  focusPauses: number;
}
export const activityDate = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function normalizeActivity(
  input: unknown,
  now = Date.now(),
): ActivityDay[] {
  if (!Array.isArray(input)) return [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 89);
  const earliest = activityDate(cutoff.getTime()),
    today = activityDate(now);
  const grouped = new Map<string, ActivityDay>();
  for (const row of input.slice(-1800)) {
    if (
      !row ||
      typeof row !== "object" ||
      !activityRoutes.includes(row.route) ||
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      row.date < earliest ||
      row.date > today
    )
      continue;
    const day = new Date(`${row.date}T12:00:00`);
    if (
      !Number.isFinite(day.getTime()) ||
      activityDate(day.getTime()) !== row.date
    )
      continue;
    const clean = { date: row.date, route: row.route } as ActivityDay;
    for (const key of [
      "visits",
      "activeSeconds",
      "backgrounds",
      "focusPauses",
    ] as const)
      clean[key] = Math.max(
        0,
        Math.min(
          key === "activeSeconds" ? 86400 : 10000,
          Number.isFinite(row[key]) ? Math.floor(row[key]) : 0,
        ),
      );
    const id = `${clean.date}:${clean.route}`,
      previous = grouped.get(id);
    if (previous)
      for (const key of [
        "visits",
        "activeSeconds",
        "backgrounds",
        "focusPauses",
      ] as const)
        clean[key] = Math.min(
          key === "activeSeconds" ? 86400 : 10000,
          clean[key] + previous[key],
        );
    grouped.set(id, clean);
  }
  return [...grouped.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.route.localeCompare(b.route),
  );
}
export function addActivity(
  rows: ActivityDay[],
  route: ActivityRoute,
  at: number,
  patch: Partial<
    Pick<
      ActivityDay,
      "visits" | "activeSeconds" | "backgrounds" | "focusPauses"
    >
  >,
): ActivityDay[] {
  return normalizeActivity(
    [
      ...rows,
      {
        date: activityDate(at),
        route,
        visits: 0,
        activeSeconds: 0,
        backgrounds: 0,
        focusPauses: 0,
        ...patch,
      },
    ],
    at,
  );
}
// A delayed heartbeat never claims a whole suspended/sleep interval as activity.
export function activeSeconds(
  mark: number,
  now: number,
  lastInput: number,
  foreground: boolean,
) {
  if (!foreground || now < mark || now - mark > 45000) return 0;
  return Math.max(
    0,
    Math.floor((Math.min(now, lastInput + 60000) - mark) / 1000),
  );
}
