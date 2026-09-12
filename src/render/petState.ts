import {
	basePosition,
	eatingSpot,
	clampPoint,
	type Point,
	type Viewport,
} from "./layout.ts";

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
	"Eating",
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
	const resumed = isStable(saved.currentState)
		? saved
		: { ...saved, currentState: "IdleSit" as const, stateEnteredAt: now };
	// A saved position can predate the current viewport (e.g. the extension
	// was reloaded into a smaller page than it last saved against) — pull it
	// back on screen the same way a live resize would, without re-anchoring
	// resting states to their canonical spot (that would break Eating's
	// walk-back-to-the-bowl resume).
	const pos = clampPoint({ x: resumed.x, y: resumed.y }, viewport);
	if (pos.x === resumed.x && pos.y === resumed.y) return resumed;
	return { ...resumed, x: pos.x, y: pos.y };
}

const RESTING_ANCHORS: Partial<
	Record<PetState, (viewport: Viewport) => Point>
> = {
	AtBase: basePosition,
	Sleeping: basePosition,
	Eating: eatingSpot,
};

export function repositionOnResize(
	snapshot: PetSnapshot,
	viewport: Viewport,
): PetSnapshot {
	const anchor = RESTING_ANCHORS[snapshot.currentState];
	const pos = anchor
		? anchor(viewport)
		: clampPoint({ x: snapshot.x, y: snapshot.y }, viewport);
	if (pos.x === snapshot.x && pos.y === snapshot.y) return snapshot;
	return { ...snapshot, x: pos.x, y: pos.y };
}
