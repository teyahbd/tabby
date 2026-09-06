import type { Facing, PetState } from "./petState.ts";

export const IDLE_MIN_MS = 30_000;
export const IDLE_MAX_MS = 90_000;

const IDLE_POSES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
]);

export function isIdlePose(state: PetState): boolean {
	return IDLE_POSES.has(state);
}

export function idleDelayMs(rng: () => number = Math.random): number {
	return IDLE_MIN_MS + Math.floor(rng() * (IDLE_MAX_MS - IDLE_MIN_MS));
}

export function nextIdlePose(
	current: PetState,
	rng: () => number = Math.random,
): { currentState: PetState; facing: Facing } {
	return {
		currentState: current === "IdleSit" ? "IdleLie" : "IdleSit",
		facing: rng() < 0.5 ? "left" : "right",
	};
}

export interface IdleLoopDeps {
	getState: () => PetState;
	onFlip: (next: { currentState: PetState; facing: Facing }) => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	rng?: () => number;
}

export function startIdleLoop(deps: IdleLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const rng = deps.rng ?? Math.random;

	let handle: number | null = null;

	const arm = () => {
		handle = setTimer(() => {
			if (isIdlePose(deps.getState())) {
				deps.onFlip(nextIdlePose(deps.getState(), rng));
			}
			arm();
		}, idleDelayMs(rng));
	};

	arm();

	return () => {
		if (handle != null) clearTimer(handle);
		handle = null;
	};
}
