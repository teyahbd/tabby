import assert from "node:assert/strict";
import { test } from "node:test";
import { PET_SIZE } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";
import {
	arrivalPose,
	facingFor,
	pickDestination,
	startWalkLoop,
	WANDER_MARGIN,
	WANDER_MAX_MS,
	WANDER_MIN_MS,
	wanderDelayMs,
	walkStep,
} from "./walkLoop.ts";

test("wanderDelayMs stays within the configured range", () => {
	assert.equal(
		wanderDelayMs(() => 0),
		WANDER_MIN_MS,
	);
	assert.ok(wanderDelayMs(() => 0.999999) < WANDER_MAX_MS);
	assert.ok(wanderDelayMs(() => 0.5) >= WANDER_MIN_MS);
});

test("pickDestination keeps the sprite fully inside the viewport", () => {
	const viewport = { width: 1000, height: 800 };
	for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
		const dest = pickDestination(viewport, () => r);
		assert.ok(dest.x >= WANDER_MARGIN);
		assert.ok(dest.x <= viewport.width - PET_SIZE - WANDER_MARGIN);
		assert.ok(dest.y >= WANDER_MARGIN);
		assert.ok(dest.y <= viewport.height - PET_SIZE - WANDER_MARGIN);
	}
});

test("walkStep advances toward the target and clamps on arrival", () => {
	const mid = walkStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 1000, 90);
	assert.deepEqual(mid, { x: 90, y: 0, arrived: false });

	const done = walkStep({ x: 0, y: 0 }, { x: 10, y: 0 }, 1000, 90);
	assert.deepEqual(done, { x: 10, y: 0, arrived: true });
});

test("facingFor points toward the destination, keeping current when level", () => {
	assert.equal(facingFor(100, 10, "right"), "left");
	assert.equal(facingFor(10, 100, "left"), "right");
	assert.equal(facingFor(50, 50, "right"), "right");
});

test("arrivalPose picks one of the two idle poses", () => {
	assert.equal(
		arrivalPose(() => 0.1),
		"IdleSit",
	);
	assert.equal(
		arrivalPose(() => 0.9),
		"IdleLie",
	);
});

function harness() {
	let timerId = 0;
	let pendingTimer: (() => void) | null = null;
	let rafId = 0;
	let pendingFrame: ((t: number) => void) | null = null;
	let clock = 0;

	return {
		setTimer(fn: () => void) {
			pendingTimer = fn;
			return ++timerId;
		},
		clearTimer() {
			pendingTimer = null;
		},
		raf(fn: (t: number) => void) {
			pendingFrame = fn;
			return ++rafId;
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

test("startWalkLoop walks to a destination and settles into an idle pose", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	let facing: Facing = "left";
	let pos = { x: 0, y: 0 };
	const arrivals: PetState[] = [];

	startWalkLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => facing,
		getViewport: () => ({ width: 1000, height: 800 }),
		onDepart: (next) => {
			state = "Walking";
			facing = next.facing;
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
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.equal(state, "Walking");

	for (let i = 0; i < 200 && h.hasFrame; i++) h.advance(100);

	assert.equal(arrivals.length, 1);
	assert.ok(state === "IdleSit" || state === "IdleLie");
	assert.ok(h.hasTimer);
});

test("startWalkLoop skips departing when the pet is not idle", () => {
	const h = harness();
	let departed = false;

	startWalkLoop({
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
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.equal(departed, false);
	assert.equal(h.hasFrame, false);
	assert.ok(h.hasTimer);
});

test("startWalkLoop abandons the walk if the state changes mid-step", () => {
	const h = harness();
	let state: PetState = "IdleSit";

	startWalkLoop({
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
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.ok(h.hasFrame);
	state = "ReturningToBase";
	h.advance(100);

	assert.equal(h.hasFrame, false);
	assert.ok(h.hasTimer);
});

test("stopping the walk loop cancels pending work", () => {
	const h = harness();
	const stop = startWalkLoop({
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
		rng: () => 0.5,
	});

	h.fireTimer();
	assert.ok(h.hasFrame);
	stop();
	assert.equal(h.hasFrame, false);
	assert.equal(h.hasTimer, false);
});
