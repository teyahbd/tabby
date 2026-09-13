import { PET_SIZE, type Point, type Viewport } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";
import { facingFor, walkStep } from "./walkLoop.ts";

function centerX(x: number): number {
	return x + PET_SIZE / 2;
}

export function chaseTarget(cursor: Point, viewport: Viewport): Point {
	const onRightHalf = cursor.x >= viewport.width / 2;
	return {
		x: onRightHalf ? cursor.x : cursor.x - PET_SIZE,
		y: cursor.y,
	};
}

export const LASER_CHECK_MS = 200;

export const LASER_CHASE_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
	"Walking",
	"AtBase",
]);

export function canChaseLaser(state: PetState, active: boolean): boolean {
	return active && LASER_CHASE_STATES.has(state);
}

export interface LaserLoopDeps {
	getState: () => PetState;
	getPosition: () => Point;
	getFacing: () => Facing;
	getViewport: () => Viewport;
	isLaserActive: () => boolean;
	getCursor: () => Point | null;
	onDepart: (next: { facing: Facing }) => void;
	onStep: (next: Point & { facing: Facing }) => void;
	onDropChase: (next: { currentState: PetState; x: number; y: number }) => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	raf?: (fn: (t: number) => void) => number;
	cancelRaf?: (handle: number) => void;
	now?: () => number;
}

export function startLaserLoop(deps: LaserLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const raf =
		deps.raf ?? ((fn) => requestAnimationFrame(fn) as unknown as number);
	const cancelRaf =
		deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
	const now = deps.now ?? (() => performance.now());

	let timerHandle: number | null = null;
	let rafHandle: number | null = null;

	const armCheck = () => {
		timerHandle = setTimer(check, LASER_CHECK_MS);
	};

	const check = () => {
		timerHandle = null;
		if (!canChaseLaser(deps.getState(), deps.isLaserActive())) {
			armCheck();
			return;
		}
		const cursor = deps.getCursor();
		const start = deps.getPosition();
		const target = cursor ? chaseTarget(cursor, deps.getViewport()) : null;
		deps.onDepart({
			facing: target
				? facingFor(start.x, target.x, deps.getFacing())
				: deps.getFacing(),
		});
		chase();
	};

	const chase = () => {
		let last = now();
		const frame = (t: number) => {
			if (deps.getState() !== "Walking") {
				rafHandle = null;
				armCheck();
				return;
			}
			if (!deps.isLaserActive()) {
				rafHandle = null;
				const pos = deps.getPosition();
				deps.onDropChase({ currentState: "IdleSit", x: pos.x, y: pos.y });
				armCheck();
				return;
			}
			const cursor = deps.getCursor();
			if (!cursor) {
				last = t;
				rafHandle = raf(frame);
				return;
			}
			const target = chaseTarget(cursor, deps.getViewport());
			const pos = deps.getPosition();
			const step = walkStep(pos, target, t - last);
			last = t;
			const facing = step.arrived
				? facingFor(centerX(step.x), cursor.x, deps.getFacing())
				: facingFor(pos.x, target.x, deps.getFacing());
			deps.onStep({ x: step.x, y: step.y, facing });
			rafHandle = raf(frame);
		};
		rafHandle = raf(frame);
	};

	armCheck();

	return () => {
		if (timerHandle != null) clearTimer(timerHandle);
		if (rafHandle != null) cancelRaf(rafHandle);
		timerHandle = null;
		rafHandle = null;
	};
}
