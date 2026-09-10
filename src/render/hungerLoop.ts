import { bowlFeedSpot, type Point, type Viewport } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";
import { facingFor, walkStep } from "./walkLoop.ts";

export const HUNGER_KEY = "hungerState";

export const HUNGER_COOLDOWN_MS = 3 * 60 * 60 * 1_000;
export const HUNGER_CHECK_MS = 5_000;
export const EAT_DURATION_MS = 60_000;

export const AWAY_EAT_THRESHOLD_MS = 30 * 60 * 1_000;
export const HEARTBEAT_MS = 60_000;

export interface HungerState {
	bowlFilled: boolean;
	lastAteAt: number | null;
	bowlFilledAt: number | null;
	lastSeenAt: number | null;
}

export const DEFAULT_HUNGER: HungerState = {
	bowlFilled: false,
	lastAteAt: null,
	bowlFilledAt: null,
	lastSeenAt: null,
};

export const EAT_START_STATES: ReadonlySet<PetState> = new Set<PetState>([
	"IdleSit",
	"IdleLie",
	"AtBase",
	"Walking",
]);

export function isHungerState(value: unknown): value is HungerState {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	const nullableNumber = (x: unknown) =>
		x === undefined || x === null || typeof x === "number";
	return (
		typeof v.bowlFilled === "boolean" &&
		nullableNumber(v.lastAteAt) &&
		nullableNumber(v.bowlFilledAt) &&
		nullableNumber(v.lastSeenAt)
	);
}

export function normalizeHunger(value: unknown): HungerState {
	if (!isHungerState(value)) return DEFAULT_HUNGER;
	return { ...DEFAULT_HUNGER, ...value };
}

export function isHungry(lastAteAt: number | null, now: number): boolean {
	return lastAteAt === null || now - lastAteAt >= HUNGER_COOLDOWN_MS;
}

export function catchUpAwayMeal(
	hunger: HungerState,
	now: number,
): HungerState | null {
	if (!hunger.bowlFilled || hunger.bowlFilledAt === null) return null;

	const lastSeen = hunger.lastSeenAt ?? hunger.bowlFilledAt;
	if (now - lastSeen < AWAY_EAT_THRESHOLD_MS) return null;

	const readyAt =
		hunger.lastAteAt === null
			? hunger.bowlFilledAt
			: Math.max(hunger.bowlFilledAt, hunger.lastAteAt + HUNGER_COOLDOWN_MS);

	const finishedAt = readyAt + EAT_DURATION_MS;
	if (finishedAt > now) return null;

	return {
		...hunger,
		bowlFilled: false,
		bowlFilledAt: null,
		lastAteAt: finishedAt,
	};
}

export interface HungerLoopDeps {
	getState: () => PetState;
	getHunger: () => HungerState;
	getPosition: () => Point;
	getFacing: () => Facing;
	getViewport: () => Viewport;
	getEnteredAt: () => number;
	onEatStart: (next: { facing: Facing }) => void;
	onEatStep: (pos: Point) => void;
	onEatArrive: (pos: Point) => void;
	onFinishEating: (next: { ateAt: number; x: number; y: number }) => void;
	onSeen?: (now: number) => void;
	setTimer?: (fn: () => void, ms: number) => number;
	clearTimer?: (handle: number) => void;
	raf?: (fn: (t: number) => void) => number;
	cancelRaf?: (handle: number) => void;
	now?: () => number;
	nowMs?: () => number;
}

export function startHungerLoop(deps: HungerLoopDeps): () => void {
	const setTimer =
		deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
	const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
	const raf =
		deps.raf ?? ((fn) => requestAnimationFrame(fn) as unknown as number);
	const cancelRaf =
		deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
	const now = deps.now ?? (() => performance.now());
	const nowMs = deps.nowMs ?? (() => Date.now());

	let timerHandle: number | null = null;
	let rafHandle: number | null = null;
	let eatHandle: number | null = null;
	let busy = false;
	let lastSeenWrite = 0;

	const beat = () => {
		const t = nowMs();
		if (t - lastSeenWrite < HEARTBEAT_MS) return;
		lastSeenWrite = t;
		deps.onSeen?.(t);
	};

	const arm = () => {
		timerHandle = setTimer(check, HUNGER_CHECK_MS);
	};

	const finish = () => {
		eatHandle = null;
		if (deps.getState() === "Eating") {
			const spot = bowlFeedSpot(deps.getViewport());
			deps.onFinishEating({ ateAt: nowMs(), x: spot.x, y: spot.y });
		}
		busy = false;
		arm();
	};

	const walkToBowlThenEat = (eatMs: number) => {
		busy = true;
		const target = bowlFeedSpot(deps.getViewport());

		let last = now();
		const frame = (t: number) => {
			if (deps.getState() !== "Eating") {
				rafHandle = null;
				busy = false;
				arm();
				return;
			}
			const step = walkStep(deps.getPosition(), target, t - last);
			last = t;
			if (step.arrived) {
				rafHandle = null;
				deps.onEatArrive({ x: target.x, y: target.y });
				eatHandle = setTimer(finish, eatMs);
				return;
			}
			deps.onEatStep({ x: step.x, y: step.y });
			rafHandle = raf(frame);
		};
		rafHandle = raf(frame);
	};

	const startEat = () => {
		const target = bowlFeedSpot(deps.getViewport());
		deps.onEatStart({
			facing: facingFor(deps.getPosition().x, target.x, deps.getFacing()),
		});
		walkToBowlThenEat(EAT_DURATION_MS);
	};

	const resumeEat = () => {
		const remaining = EAT_DURATION_MS - (nowMs() - deps.getEnteredAt());
		walkToBowlThenEat(Math.max(0, remaining));
	};

	const check = () => {
		timerHandle = null;
		beat();
		if (busy) {
			arm();
			return;
		}
		const hunger = deps.getHunger();
		if (
			hunger.bowlFilled &&
			isHungry(hunger.lastAteAt, nowMs()) &&
			EAT_START_STATES.has(deps.getState())
		) {
			startEat();
			return;
		}
		arm();
	};

	if (deps.getState() === "Eating") resumeEat();
	else check();

	return () => {
		if (timerHandle != null) clearTimer(timerHandle);
		if (rafHandle != null) cancelRaf(rafHandle);
		if (eatHandle != null) clearTimer(eatHandle);
		timerHandle = null;
		rafHandle = null;
		eatHandle = null;
	};
}
