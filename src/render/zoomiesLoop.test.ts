import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetState } from "./petState.ts";
import { WALK_SPEED_PX_PER_S } from "./walkLoop.ts";
import {
	shouldStartZoomies,
	startZoomiesLoop,
	ZOOMIES_DURATION_MAX_MS,
	ZOOMIES_DURATION_MIN_MS,
	ZOOMIES_HARD_FLOOR_MS,
	ZOOMIES_MAX_MS,
	ZOOMIES_MIN_MS,
	ZOOMIES_SPEED_MULTIPLIER,
	zoomiesDelayMs,
	zoomiesDurationMs,
	zoomiesSpeed,
} from "./zoomiesLoop.ts";

test("zoomiesDelayMs stays within range and respects the hard floor", () => {
	assert.equal(
		zoomiesDelayMs(() => 0),
		ZOOMIES_MIN_MS,
	);
	assert.ok(zoomiesDelayMs(() => 0.999999) < ZOOMIES_MAX_MS);
	assert.ok(zoomiesDelayMs(() => 0.5) >= ZOOMIES_HARD_FLOOR_MS);
});

test("zoomiesDurationMs stays within range", () => {
	assert.equal(
		zoomiesDurationMs(() => 0),
		ZOOMIES_DURATION_MIN_MS,
	);
	assert.ok(zoomiesDurationMs(() => 0.999999) < ZOOMIES_DURATION_MAX_MS);
});

test("zoomiesSpeed is a fixed multiple of the normal walk speed", () => {
	assert.equal(zoomiesSpeed(), WALK_SPEED_PX_PER_S * ZOOMIES_SPEED_MULTIPLIER);
});

test("shouldStartZoomies requires daytime and an unsuppressed state", () => {
	assert.equal(shouldStartZoomies("IdleSit", true), true);
	assert.equal(shouldStartZoomies("Walking", true), true);
	assert.equal(shouldStartZoomies("AtBase", true), true);
	assert.equal(shouldStartZoomies("IdleSit", false), false);
	assert.equal(shouldStartZoomies("Napping", true), false);
	assert.equal(shouldStartZoomies("Sleeping", true), false);
	assert.equal(shouldStartZoomies("Eating", true), false);
	assert.equal(shouldStartZoomies("Dragged", true), false);
	assert.equal(shouldStartZoomies("ReturningToBase", true), false);
});

function harness() {
	let pendingTimer: (() => void) | null = null;
	let pendingFrame: ((t: number) => void) | null = null;
	let clock = 0;

	return {
		setTimer(fn: () => void) {
			pendingTimer = fn;
			return 1;
		},
		clearTimer() {
			pendingTimer = null;
		},
		raf(fn: (t: number) => void) {
			pendingFrame = fn;
			return 1;
		},
		cancelRaf() {
			pendingFrame = null;
		},
		now: () => clock,
		fireTimer() {
			const fn = pendingTimer;
			pendingTimer = null;
			fn?.();
		},
		advance(ms: number) {
			clock += ms;
			const fn = pendingFrame;
			pendingFrame = null;
			fn?.(clock);
		},
		get hasFrame() {
			return pendingFrame != null;
		},
		get hasTimer() {
			return pendingTimer != null;
		},
	};
}

const day = () => new Date(2026, 8, 6, 12, 0);
const night = () => new Date(2026, 8, 6, 23, 0);

test("startZoomiesLoop skips when suppressed or at night, and rearms", () => {
	const h = harness();
	let departed = false;

	startZoomiesLoop({
		getState: () => "Napping",
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: () => {
			departed = true;
		},
		onStep: () => {},
		onArrive: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowDate: day,
		rng: () => 0,
	});

	h.fireTimer();
	assert.equal(departed, false);
	assert.ok(h.hasTimer);

	// also skipped at night even from an otherwise-eligible state
	const h2 = harness();
	let departed2 = false;
	startZoomiesLoop({
		getState: () => "IdleSit",
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: () => {
			departed2 = true;
		},
		onStep: () => {},
		onArrive: () => {},
		setTimer: h2.setTimer,
		clearTimer: h2.clearTimer,
		raf: h2.raf,
		cancelRaf: h2.cancelRaf,
		now: h2.now,
		nowDate: night,
		rng: () => 0,
	});
	h2.fireTimer();
	assert.equal(departed2, false);
	assert.ok(h2.hasTimer);
});

test("startZoomiesLoop dashes through several destinations then settles to IdleSit", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	let facing: "left" | "right" = "left";
	let pos = { x: 0, y: 0 };
	let departs = 0;
	const arrivals: PetState[] = [];

	startZoomiesLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => facing,
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: (next) => {
			state = "Walking";
			facing = next.facing;
			departs++;
		},
		onStep: (next) => {
			pos = next;
		},
		onArrive: (next) => {
			state = next.currentState;
			pos = { x: next.x, y: next.y };
			arrivals.push(next.currentState);
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowDate: day,
		// first roll picks the delay, later rolls feed duration/speed/destinations
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.equal(state, "Walking");
	assert.equal(departs, 1);

	for (let i = 0; i < 2000 && h.hasFrame; i++) h.advance(50);

	assert.equal(arrivals.length, 1);
	assert.equal(arrivals[0], "IdleSit");
	assert.ok(departs > 1, "should have strung together more than one dash");
	assert.ok(h.hasTimer);
});

test("startZoomiesLoop abandons a dash if the state changes mid-step (e.g. a drag)", () => {
	const h = harness();
	let state: PetState = "IdleSit";

	startZoomiesLoop({
		getState: () => state,
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: () => {
			state = "Walking";
		},
		onStep: () => {},
		onArrive: () => {
			throw new Error("should not arrive");
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowDate: day,
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.ok(h.hasFrame);
	state = "Dragged";
	h.advance(100);

	assert.equal(h.hasFrame, false);
	assert.ok(h.hasTimer);
});

test("startZoomiesLoop resumes an in-progress dash toward its stored target (Fix 5)", () => {
	const h = harness();
	let state: PetState = "Walking";
	let pos = { x: 0, y: 0 };
	let departed = false;
	const arrivals: PetState[] = [];

	startZoomiesLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		// endAt just barely in the future — the resumed session has only a
		// moment left, so it should settle as soon as this one dash arrives.
		getResumeZoomies: () => ({ target: { x: 500, y: 0 }, endAt: 1 }),
		onDepart: () => {
			departed = true;
		},
		onStep: (next) => {
			pos = next;
		},
		onArrive: (next) => {
			state = next.currentState;
			pos = { x: next.x, y: next.y };
			arrivals.push(next.currentState);
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowMs: () => 0,
		nowDate: day,
		rng: () => 0.5,
	});

	assert.equal(
		departed,
		false,
		"resuming a dash already in progress is not a fresh depart",
	);
	assert.ok(
		h.hasFrame,
		"should start dashing immediately, not wait on the delay timer",
	);

	for (let i = 0; i < 200 && h.hasFrame; i++) h.advance(100);

	assert.deepEqual(pos, { x: 500, y: 0 });
	assert.deepEqual(arrivals, ["IdleSit"]);
});

test("startZoomiesLoop settles to IdleSit immediately if the resumed session already expired", () => {
	const h = harness();
	let state: PetState = "Walking";
	const pos = { x: 42, y: 7 };
	const arrivals: PetState[] = [];

	startZoomiesLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		getResumeZoomies: () => ({ target: { x: 500, y: 0 }, endAt: -1 }),
		onDepart: () => {},
		onStep: () => {},
		onArrive: (next) => {
			state = next.currentState;
			arrivals.push(next.currentState);
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowMs: () => 0,
		nowDate: day,
		rng: () => 0.5,
	});

	assert.equal(h.hasFrame, false);
	assert.deepEqual(arrivals, ["IdleSit"]);
	assert.ok(h.hasTimer, "resumes the normal delay timer afterward");
});

test("startZoomiesLoop persists the session end time once, not per dash", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	let starts = 0;
	let lastEndAt: number | undefined;

	startZoomiesLoop({
		getState: () => state,
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		onZoomiesStart: ({ endAt }) => {
			starts++;
			lastEndAt = endAt;
		},
		onDepart: () => {
			state = "Walking";
		},
		onStep: () => {},
		onArrive: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowMs: () => 1_000,
		nowDate: day,
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.equal(starts, 1);
	assert.equal(lastEndAt, 1_000 + zoomiesDurationMs(() => 0.5));

	for (let i = 0; i < 2000 && h.hasFrame; i++) h.advance(50);
	assert.equal(
		starts,
		1,
		"still just the one start, even across several dashes",
	);
});

test("stopping the zoomies loop cancels pending work", () => {
	const h = harness();
	const stop = startZoomiesLoop({
		getState: () => "IdleSit",
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: () => {},
		onStep: () => {},
		onArrive: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowDate: day,
		rng: () => 0.5,
	});

	assert.ok(h.hasTimer);
	stop();
	assert.equal(h.hasTimer, false);
});

test("startZoomiesLoop can start at night while on a night visit", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	let departed = false;

	startZoomiesLoop({
		getState: () => state,
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: () => {
			state = "Walking";
			departed = true;
		},
		onStep: () => {},
		onArrive: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowDate: night,
		rng: () => 0.5,
		isNightVisiting: () => true,
	});

	h.fireTimer();
	assert.equal(departed, true);
});
