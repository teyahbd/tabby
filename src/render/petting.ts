import type { PetState } from "./petState.ts";

export const PET_SUPPRESSED_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"Dragged",
	"Sleeping",
	"Napping",
	"Eating",
]);

export const PET_MOVE_TOLERANCE_PX = 4;

export function canPet(state: PetState): boolean {
	return !PET_SUPPRESSED_STATES.has(state);
}

export interface PettingDeps {
	sprite: EventTarget;
	getState: () => PetState;
	onPet: () => void;
}

export function startPetting(deps: PettingDeps): () => void {
	let downAt: { x: number; y: number } | null = null;

	const onDown = (event: Event) => {
		const e = event as PointerEvent;
		if (e.button > 0) return;
		downAt = { x: e.clientX, y: e.clientY };
	};

	const onClick = (event: Event) => {
		const e = event as MouseEvent;
		const start = downAt;
		downAt = null;
		if (!start) return;
		if (
			Math.hypot(e.clientX - start.x, e.clientY - start.y) >
			PET_MOVE_TOLERANCE_PX
		) {
			return;
		}
		if (!canPet(deps.getState())) return;
		deps.onPet();
	};

	deps.sprite.addEventListener("pointerdown", onDown);
	deps.sprite.addEventListener("click", onClick);

	return () => {
		deps.sprite.removeEventListener("pointerdown", onDown);
		deps.sprite.removeEventListener("click", onClick);
	};
}

export default startPetting;
