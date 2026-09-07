import { isIdlePose } from "./idleLoop.ts";
import { PET_SIZE, type Point, type Viewport } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";

export const WANDER_MIN_MS = 120_000;
export const WANDER_MAX_MS = 300_000;
export const WALK_SPEED_PX_PER_S = 90;
export const WANDER_MARGIN = 24;

export function wanderDelayMs(rng: () => number = Math.random): number {
	return WANDER_MIN_MS + Math.floor(rng() * (WANDER_MAX_MS - WANDER_MIN_MS));
}

export function pickDestination(
	viewport: Viewport,
	rng: () => number = Math.random,
	petSize = PET_SIZE,
): Point {
	const spanX = Math.max(0, viewport.width - petSize - 2 * WANDER_MARGIN);
	const spanY = Math.max(0, viewport.height - petSize - 2 * WANDER_MARGIN);
	return {
		x: WANDER_MARGIN + Math.round(rng() * spanX),
		y: WANDER_MARGIN + Math.round(rng() * spanY),
	};
}

export function walkStep(
	from: Point,
	to: Point,
	dtMs: number,
	speed = WALK_SPEED_PX_PER_S,
): { x: number; y: number; arrived: boolean } {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const dist = Math.hypot(dx, dy);
	const travel = (speed * Math.max(0, dtMs)) / 1000;
	if (dist === 0 || travel >= dist) return { x: to.x, y: to.y, arrived: true };
	return {
		x: from.x + (dx / dist) * travel,
		y: from.y + (dy / dist) * travel,
		arrived: false,
	};
}

export function facingFor(fromX: number, toX: number, current: Facing): Facing {
	if (toX < fromX) return "left";
	if (toX > fromX) return "right";
	return current;
}

export function arrivalPose(rng: () => number = Math.random): PetState {
	return rng() < 0.5 ? "IdleSit" : "IdleLie";
}

export interface WalkLoopDeps {
	getState: () => PetState;
	getPosition: () => Point;
	getFacing: () => Facing;
	getViewport: () => Viewport;
	onDepart: (next: { facing: Facing }) => void;
	onStep: (pos: Point) => void;
	onArrive: (next: { currentState: PetState; x: number; y: number }) => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	raf?: (fn: (t: number) => void) => number;
	cancelRaf?: (handle: number) => void;
	now?: () => number;
	rng?: () => number;
}

export function startWalkLoop(deps: WalkLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const raf =
		deps.raf ?? ((fn) => requestAnimationFrame(fn) as unknown as number);
	const cancelRaf =
		deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
	const now = deps.now ?? (() => performance.now());
	const rng = deps.rng ?? Math.random;

	let timerHandle: number | null = null;
	let rafHandle: number | null = null;

	const arm = () => {
		timerHandle = setTimer(depart, wanderDelayMs(rng));
	};

	const depart = () => {
		timerHandle = null;
		if (!isIdlePose(deps.getState())) {
			arm();
			return;
		}

		const start = deps.getPosition();
		const dest = pickDestination(deps.getViewport(), rng);
		deps.onDepart({ facing: facingFor(start.x, dest.x, deps.getFacing()) });

		let last = now();
		const frame = (t: number) => {
			if (deps.getState() !== "Walking") {
				rafHandle = null;
				arm();
				return;
			}
			const step = walkStep(deps.getPosition(), dest, t - last);
			last = t;
			if (step.arrived) {
				rafHandle = null;
				deps.onArrive({
					currentState: arrivalPose(rng),
					x: dest.x,
					y: dest.y,
				});
				arm();
				return;
			}
			deps.onStep({ x: step.x, y: step.y });
			rafHandle = raf(frame);
		};
		rafHandle = raf(frame);
	};

	arm();

	return () => {
		if (timerHandle != null) clearTimer(timerHandle);
		if (rafHandle != null) cancelRaf(rafHandle);
		timerHandle = null;
		rafHandle = null;
	};
}
