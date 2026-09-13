import { type Point, type Viewport } from "./layout.ts";
import { isDaytime } from "./napLoop.ts";
import type { Facing, PetState } from "./petState.ts";
import {
	WALK_SPEED_PX_PER_S,
	facingFor,
	pickDestination,
	walkStep,
} from "./walkLoop.ts";

export const ZOOMIES_MIN_MS = 35 * 60_000;
export const ZOOMIES_MAX_MS = 90 * 60_000;
export const ZOOMIES_HARD_FLOOR_MS = 20 * 60_000;
export const ZOOMIES_DURATION_MIN_MS = 20_000;
export const ZOOMIES_DURATION_MAX_MS = 30_000;
export const ZOOMIES_SPEED_MULTIPLIER = 2.5;

export const ZOOMIES_SUPPRESSED_STATES: ReadonlySet<PetState> =
	new Set<PetState>([
		"Napping",
		"Sleeping",
		"Eating",
		"Dragged",
		"ReturningToBase",
	]);

export function zoomiesDelayMs(rng: () => number = Math.random): number {
	const delay =
		ZOOMIES_MIN_MS + Math.floor(rng() * (ZOOMIES_MAX_MS - ZOOMIES_MIN_MS));
	return Math.max(delay, ZOOMIES_HARD_FLOOR_MS);
}

export function zoomiesDurationMs(rng: () => number = Math.random): number {
	return (
		ZOOMIES_DURATION_MIN_MS +
		Math.floor(rng() * (ZOOMIES_DURATION_MAX_MS - ZOOMIES_DURATION_MIN_MS))
	);
}

export function zoomiesSpeed(): number {
	return WALK_SPEED_PX_PER_S * ZOOMIES_SPEED_MULTIPLIER;
}

export function shouldStartZoomies(
	state: PetState,
	daytime: boolean,
	laserActive = false,
): boolean {
	return daytime && !laserActive && !ZOOMIES_SUPPRESSED_STATES.has(state);
}

export interface ZoomiesLoopDeps {
	getState: () => PetState;
	getPosition: () => Point;
	getFacing: () => Facing;
	getViewport: () => Viewport;
	getResumeZoomies?: () => { target: Point; endAt: number } | undefined;
	onZoomiesStart?: (next: { endAt: number }) => void;
	onDepart: (next: {
		facing: Facing;
		targetX: number;
		targetY: number;
	}) => void;
	onStep: (pos: Point) => void;
	onArrive: (next: { currentState: PetState; x: number; y: number }) => void;
	isNightVisiting?: () => boolean;
	isLaserActive?: () => boolean;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	raf?: (fn: (t: number) => void) => number;
	cancelRaf?: (handle: number) => void;
	now?: () => number;
	nowMs?: () => number;
	nowDate?: () => Date;
	rng?: () => number;
}

export function startZoomiesLoop(deps: ZoomiesLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const raf =
		deps.raf ?? ((fn) => requestAnimationFrame(fn) as unknown as number);
	const cancelRaf =
		deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
	const now = deps.now ?? (() => performance.now());
	const nowMs = deps.nowMs ?? (() => Date.now());
	const nowDate = deps.nowDate ?? (() => new Date());
	const rng = deps.rng ?? Math.random;

	let timerHandle: number | null = null;
	let rafHandle: number | null = null;

	const arm = () => {
		timerHandle = setTimer(check, zoomiesDelayMs(rng));
	};

	const check = () => {
		timerHandle = null;
		const daytime = isDaytime(nowDate()) || (deps.isNightVisiting?.() ?? false);
		const laserActive = deps.isLaserActive?.() ?? false;
		if (!shouldStartZoomies(deps.getState(), daytime, laserActive)) {
			arm();
			return;
		}
		run(zoomiesDurationMs(rng), deps.getPosition());
	};

	const dash = (dest: Point, endAt: number) => {
		let last = now();
		const frame = (t: number) => {
			if (deps.getState() !== "Walking") {
				rafHandle = null;
				arm();
				return;
			}
			const step = walkStep(deps.getPosition(), dest, t - last, zoomiesSpeed());
			last = t;
			if (step.arrived) {
				if (t >= endAt) {
					rafHandle = null;
					deps.onArrive({
						currentState: "IdleSit",
						x: step.x,
						y: step.y,
					});
					arm();
					return;
				}
				const from = { x: step.x, y: step.y };
				const next = pickDestination(deps.getViewport(), rng);
				deps.onStep(from);
				deps.onDepart({
					facing: facingFor(from.x, next.x, deps.getFacing()),
					targetX: next.x,
					targetY: next.y,
				});
				dash(next, endAt);
				return;
			}
			deps.onStep({ x: step.x, y: step.y });
			rafHandle = raf(frame);
		};
		rafHandle = raf(frame);
	};

	const run = (durationMs: number, start: Point) => {
		const endAt = now() + durationMs;
		deps.onZoomiesStart?.({ endAt: nowMs() + durationMs });
		const dest = pickDestination(deps.getViewport(), rng);
		deps.onDepart({
			facing: facingFor(start.x, dest.x, deps.getFacing()),
			targetX: dest.x,
			targetY: dest.y,
		});
		dash(dest, endAt);
	};

	const resume = deps.getResumeZoomies?.();
	if (resume && deps.getState() === "Walking") {
		const remaining = resume.endAt - nowMs();
		if (remaining > 0) {
			dash(resume.target, now() + remaining);
		} else {
			deps.onArrive({
				currentState: "IdleSit",
				x: deps.getPosition().x,
				y: deps.getPosition().y,
			});
			arm();
		}
	} else {
		arm();
	}

	return () => {
		if (timerHandle != null) clearTimer(timerHandle);
		if (rafHandle != null) cancelRaf(rafHandle);
		timerHandle = null;
		rafHandle = null;
	};
}
