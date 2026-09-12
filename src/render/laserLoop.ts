import { type Point } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";
import { facingFor, walkStep } from "./walkLoop.ts";

export const LASER_CHECK_MS = 200;

// Extra 1's interrupt list — states the laser breaks off to chase from.
// Napping/Sleeping/Eating/Dragged/ReturningToBase are deliberately absent:
// the laser only picks the chase back up once one of those ends naturally.
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
	isLaserActive: () => boolean;
	// Live cursor position, or null before the first mousemove of the session.
	getCursor: () => Point | null;
	onDepart: (next: { facing: Facing }) => void;
	onStep: (next: Point & { facing: Facing }) => void;
	// Fired when the laser turns off mid-chase — same handling as a normal
	// Walking arrival (settle at the current spot, resume idle/wander timers).
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
		deps.onDepart({
			facing: cursor
				? facingFor(start.x, cursor.x, deps.getFacing())
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
			const pos = deps.getPosition();
			const step = walkStep(pos, cursor, t - last);
			last = t;
			deps.onStep({
				x: step.x,
				y: step.y,
				facing: facingFor(pos.x, cursor.x, deps.getFacing()),
			});
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
