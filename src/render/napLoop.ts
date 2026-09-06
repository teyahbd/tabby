import type { PetState } from "./petState.ts";

export const NAP_CHECK_MIN_MS = 2_000;
export const NAP_CHECK_MAX_MS = 3_000;
export const NAP_CHANCE = 1; // always nap
export const NAP_MIN_MS = 5_000;
export const NAP_MAX_MS = 8_000;

export const NAP_START_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
	"AtBase",
]);

export function napCheckDelayMs(rng: () => number = Math.random): number {
	return (
		NAP_CHECK_MIN_MS + Math.floor(rng() * (NAP_CHECK_MAX_MS - NAP_CHECK_MIN_MS))
	);
}

export function napDurationMs(rng: () => number = Math.random): number {
	return NAP_MIN_MS + Math.floor(rng() * (NAP_MAX_MS - NAP_MIN_MS));
}

export function isDaytime(date: Date = new Date()): boolean {
	const hour = date.getHours();
	return hour >= 7 && hour < 22;
}

export function shouldNap(
	state: PetState,
	daytime: boolean,
	rng: () => number = Math.random,
): boolean {
	return daytime && NAP_START_STATES.has(state) && rng() < NAP_CHANCE;
}

export interface NapLoopDeps {
	getState: () => PetState;
	onNap: () => void;
	onWake: () => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	now?: () => Date;
	rng?: () => number;
}

export function startNapLoop(deps: NapLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const now = deps.now ?? (() => new Date());
	const rng = deps.rng ?? Math.random;

	let handle: number | null = null;

	const armCheck = () => {
		handle = setTimer(check, napCheckDelayMs(rng));
	};

	const check = () => {
		handle = null;
		if (shouldNap(deps.getState(), isDaytime(now()), rng)) {
			deps.onNap();
			handle = setTimer(wake, napDurationMs(rng));
			return;
		}
		armCheck();
	};

	const wake = () => {
		handle = null;
		if (deps.getState() === "Napping") deps.onWake();
		armCheck();
	};

	armCheck();

	return () => {
		if (handle != null) clearTimer(handle);
		handle = null;
	};
}
