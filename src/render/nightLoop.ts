import { basePosition, type Point, type Viewport } from "./layout.ts";
import { isDaytime } from "./napLoop.ts";
import type { Facing, PetState } from "./petState.ts";
import { facingFor, walkStep } from "./walkLoop.ts";

export const NIGHT_CHECK_MS = 30_000;

export const RETURN_START_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
	"Walking",
	"Napping",
]);

export function isNight(date: Date = new Date()): boolean {
	return !isDaytime(date);
}

export interface NightLoopDeps {
	getState: () => PetState;
	getPosition: () => Point;
	getFacing: () => Facing;
	getViewport: () => Viewport;
	onReturnDepart: (next: { facing: Facing }) => void;
	onReturnStep: (pos: Point) => void;
	onSleep: (pos: Point) => void;
	onWake: () => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	raf?: (fn: (t: number) => void) => number;
	cancelRaf?: (handle: number) => void;
	now?: () => number;
	nowDate?: () => Date;
}

export function startNightLoop(deps: NightLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const raf =
		deps.raf ?? ((fn) => requestAnimationFrame(fn) as unknown as number);
	const cancelRaf =
		deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
	const now = deps.now ?? (() => performance.now());
	const nowDate = deps.nowDate ?? (() => new Date());

	let timerHandle: number | null = null;
	let rafHandle: number | null = null;

	const arm = () => {
		timerHandle = setTimer(check, NIGHT_CHECK_MS);
	};

	const startReturn = () => {
		const base = basePosition(deps.getViewport());
		deps.onReturnDepart({
			facing: facingFor(deps.getPosition().x, base.x, deps.getFacing()),
		});

		let last = now();
		const frame = (t: number) => {
			if (deps.getState() !== "ReturningToBase") {
				rafHandle = null;
				arm();
				return;
			}
			const step = walkStep(deps.getPosition(), base, t - last);
			last = t;
			if (step.arrived) {
				rafHandle = null;
				deps.onSleep({ x: base.x, y: base.y });
				arm();
				return;
			}
			deps.onReturnStep({ x: step.x, y: step.y });
			rafHandle = raf(frame);
		};
		rafHandle = raf(frame);
	};

	const check = () => {
		timerHandle = null;
		const state = deps.getState();

		if (!isNight(nowDate())) {
			if (state === "Sleeping") deps.onWake();
			arm();
			return;
		}

		if (state === "AtBase") {
			deps.onSleep(deps.getPosition());
		} else if (RETURN_START_STATES.has(state)) {
			startReturn();
			return;
		}
		arm();
	};

	check();

	return () => {
		if (timerHandle != null) clearTimer(timerHandle);
		if (rafHandle != null) cancelRaf(rafHandle);
		timerHandle = null;
		rafHandle = null;
	};
}
