import {
	basePosition,
	clampPoint,
	PET_SIZE,
	type Point,
	type Viewport,
} from "./layout.ts";
import type { PetState } from "./petState.ts";

export const DRAG_START_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
	"Walking",
	"Napping",
	"ReturningToBase",
	"AtBase",
]);

export const BED_SNAP_RADIUS = PET_SIZE * 1.5;
export const DRAG_THRESHOLD_PX = 4;

export function canGrab(state: PetState): boolean {
	return DRAG_START_STATES.has(state);
}

export function clampToViewport(
	pos: Point,
	viewport: Viewport,
	petSize = PET_SIZE,
): Point {
	return clampPoint(pos, viewport, petSize);
}

export function dropState(
	pos: Point,
	viewport: Viewport,
	radius = BED_SNAP_RADIUS,
): PetState {
	const base = basePosition(viewport);
	return Math.hypot(pos.x - base.x, pos.y - base.y) <= radius
		? "AtBase"
		: "IdleSit";
}

export interface DragInputDeps {
	sprite: EventTarget;
	moveTarget?: EventTarget;
	getState: () => PetState;
	getPosition: () => Point;
	getViewport: () => Viewport;
	onGrab: () => void;
	onDrag: (pos: Point) => void;
	onDrop: (next: { currentState: PetState; x: number; y: number }) => void;
}

export function startDragInput(deps: DragInputDeps): () => void {
	const moveTarget = deps.moveTarget ?? deps.sprite;

	let pointerStart: Point | null = null;
	let petStart: Point = { x: 0, y: 0 };
	let grabbed = false;

	const currentPos = (event: PointerEvent): Point => {
		const viewport = deps.getViewport();
		return clampToViewport(
			{
				x: petStart.x + (event.clientX - (pointerStart?.x ?? 0)),
				y: petStart.y + (event.clientY - (pointerStart?.y ?? 0)),
			},
			viewport,
		);
	};

	const onMove = (event: Event) => {
		const e = event as PointerEvent;
		if (!pointerStart) return;
		if (!grabbed) {
			const moved = Math.hypot(
				e.clientX - pointerStart.x,
				e.clientY - pointerStart.y,
			);
			if (moved <= DRAG_THRESHOLD_PX) return;
			grabbed = true;
			deps.onGrab();
		}
		deps.onDrag(currentPos(e));
	};

	const onUp = (event: Event) => {
		const e = event as PointerEvent;
		if (!pointerStart) return;
		const wasGrabbed = grabbed;
		const pos = currentPos(e);
		pointerStart = null;
		grabbed = false;
		moveTarget.removeEventListener("pointermove", onMove);
		moveTarget.removeEventListener("pointerup", onUp);
		moveTarget.removeEventListener("pointercancel", onUp);
		if (!wasGrabbed) return;
		deps.onDrop({
			currentState: dropState(pos, deps.getViewport()),
			x: pos.x,
			y: pos.y,
		});
	};

	const onDown = (event: Event) => {
		const e = event as PointerEvent;
		if (e.isPrimary === false || e.button > 0) return;
		if (pointerStart || !canGrab(deps.getState())) return;
		e.preventDefault?.();
		pointerStart = { x: e.clientX, y: e.clientY };
		petStart = deps.getPosition();
		grabbed = false;
		moveTarget.addEventListener("pointermove", onMove);
		moveTarget.addEventListener("pointerup", onUp);
		moveTarget.addEventListener("pointercancel", onUp);
	};

	deps.sprite.addEventListener("pointerdown", onDown);

	return () => {
		deps.sprite.removeEventListener("pointerdown", onDown);
		moveTarget.removeEventListener("pointermove", onMove);
		moveTarget.removeEventListener("pointerup", onUp);
		moveTarget.removeEventListener("pointercancel", onUp);
		pointerStart = null;
		grabbed = false;
	};
}
