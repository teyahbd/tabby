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
	targetX?: number;
	targetY?: number;
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

function isResumableMotion(saved: PetSnapshot): boolean {
	if (saved.currentState === "ReturningToBase") return true;
	if (saved.currentState === "Walking") {
		return (
			typeof saved.targetX === "number" && typeof saved.targetY === "number"
		);
	}
	return false;
}

export function resolveWalkResume(
	snapshot: PetSnapshot | null | undefined,
): Point | undefined {
	if (!snapshot || snapshot.currentState !== "Walking") return undefined;
	if (snapshot.zoomiesEndAt != null) return undefined;
	if (
		typeof snapshot.targetX !== "number" ||
		typeof snapshot.targetY !== "number"
	) {
		return undefined;
	}
	return { x: snapshot.targetX, y: snapshot.targetY };
}

export function resolveZoomiesResume(
	snapshot: PetSnapshot | null | undefined,
): { target: Point; endAt: number } | undefined {
	if (!snapshot || snapshot.currentState !== "Walking") return undefined;
	if (snapshot.zoomiesEndAt == null) return undefined;
	if (
		typeof snapshot.targetX !== "number" ||
		typeof snapshot.targetY !== "number"
	) {
		return undefined;
	}
	return {
		target: { x: snapshot.targetX, y: snapshot.targetY },
		endAt: snapshot.zoomiesEndAt,
	};
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
