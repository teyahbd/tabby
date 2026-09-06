import { basePosition, type Viewport } from "./layout.ts";

export const PET_STATE_KEY = "petState";

export type PetState =
	| "IdleSit"
	| "IdleLie"
	| "Walking"
	| "Napping"
	| "AtBase"
	| "ReturningToBase"
	| "Sleeping"
	| "Eating"
	| "Dragged";

export type Facing = "left" | "right";

export interface PetSnapshot {
	x: number;
	y: number;
	facing: Facing;
	currentState: PetState;
	stateEnteredAt: number;
}

const STABLE_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
	"Napping",
	"AtBase",
	"Sleeping",
]);

export function isStable(state: PetState): boolean {
	return STABLE_STATES.has(state);
}

export function initialSnapshot(
	viewport: Viewport,
	now: number = Date.now(),
): PetSnapshot {
	const pos = basePosition(viewport);
	return {
		x: pos.x,
		y: pos.y,
		facing: "left",
		currentState: "IdleSit",
		stateEnteredAt: now,
	};
}

function isPetSnapshot(value: unknown): value is PetSnapshot {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.x === "number" &&
		typeof v.y === "number" &&
		(v.facing === "left" || v.facing === "right") &&
		typeof v.currentState === "string" &&
		typeof v.stateEnteredAt === "number"
	);
}

export function resumeSnapshot(
	saved: unknown,
	viewport: Viewport,
	now: number = Date.now(),
): PetSnapshot {
	if (!isPetSnapshot(saved)) return initialSnapshot(viewport, now);
	if (isStable(saved.currentState)) return saved;
	return { ...saved, currentState: "IdleSit", stateEnteredAt: now };
}
