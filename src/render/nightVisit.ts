export const NIGHT_VISIT_KEY = "nightVisitUntil";

export const NIGHT_VISIT_DURATION_MS = 60 * 60 * 1_000;

export function isNightVisiting(until: number | null, now: number): boolean {
	return until !== null && now < until;
}
