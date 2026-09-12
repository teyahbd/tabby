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
	// Walking's current destination (plain wander or a zoomies dash) — needed
	// to resume the walk toward the same point rather than picking a new one.
	// Absent for every other state.
	targetX?: number;
	targetY?: number;
	// Wall-clock end time of the current zoomies session. Present only while
	// currentState is "Walking" *and* the walk is a zoomies dash, not a plain
	// wander — that's how the two are told apart on resume, since both reuse
	// the "Walking" state.
	zoomiesEndAt?: number;
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

// Resumable but not "stable" (see isStable) — these are mid-motion states
// that can pick their walk back up on resume instead of collapsing, given
// enough saved info to know where they were headed:
// - ReturningToBase always qualifies — its target (basePosition) is derived
//   live, never stored.
// - Walking only qualifies with a stored target, since its destination
//   (plain wander or zoomies dash) is otherwise random and unrecoverable.
function isResumableMotion(saved: PetSnapshot): boolean {
	if (saved.currentState === "ReturningToBase") return true;
	if (saved.currentState === "Walking") {
		return (
			typeof saved.targetX === "number" && typeof saved.targetY === "number"
		);
	}
	return false;
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
	const optionalNumber = (x: unknown) =>
		x === undefined || typeof x === "number";
	return (
		typeof v.x === "number" &&
		typeof v.y === "number" &&
		(v.facing === "left" || v.facing === "right") &&
		typeof v.currentState === "string" &&
		typeof v.stateEnteredAt === "number" &&
		optionalNumber(v.targetX) &&
		optionalNumber(v.targetY) &&
		optionalNumber(v.zoomiesEndAt)
	);
}

export function resumeSnapshot(
	saved: unknown,
	viewport: Viewport,
	now: number = Date.now(),
): PetSnapshot {
	if (!isPetSnapshot(saved)) return initialSnapshot(viewport, now);
	const resumed =
		isStable(saved.currentState) || isResumableMotion(saved)
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
