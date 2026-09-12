import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetState } from "./petState.ts";
import { canChaseLaser, LASER_CHECK_MS, startLaserLoop } from "./laserLoop.ts";

test("canChaseLaser covers the interrupt list only when active", () => {
	for (const s of ["IdleSit", "IdleLie", "Walking", "AtBase"] as PetState[]) {
		assert.ok(canChaseLaser(s, true), s);
		assert.equal(canChaseLaser(s, false), false, s);
	}
	for (const s of [
		"Napping",
		"Sleeping",
		"Eating",
		"Dragged",
		"ReturningToBase",
	] as PetState[]) {
		assert.equal(canChaseLaser(s, true), false, s);
	}
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

test("startLaserLoop does nothing while inactive, and keeps polling", () => {
	const h = harness();
	let departed = false;

	startLaserLoop({
		getState: () => "IdleSit",
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		isLaserActive: () => false,
		getCursor: () => ({ x: 500, y: 500 }),
		onDepart: () => {
			departed = true;
		},
		onStep: () => {},
		onDropChase: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
	});

	h.fireTimer();
	assert.equal(departed, false);
	assert.ok(h.hasTimer);
});

test("startLaserLoop interrupts an idle-ish state to chase the cursor", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	let pos = { x: 0, y: 0 };
	let facing: "left" | "right" = "left";
	let departs = 0;

	startLaserLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => facing,
		isLaserActive: () => true,
		getCursor: () => ({ x: 300, y: 0 }),
		onDepart: (next) => {
			state = "Walking";
			facing = next.facing;
			departs++;
		},
		onStep: (next) => {
			pos = { x: next.x, y: next.y };
			facing = next.facing;
		},
		onDropChase: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
	});

	h.fireTimer();
	assert.equal(state, "Walking");
	assert.equal(facing, "right");
	assert.equal(departs, 1);

	h.advance(4_000);
	assert.equal(pos.x, 300);
	assert.ok(h.hasFrame, "keeps chasing frame over frame while active");
});

test("startLaserLoop settles to IdleSit when the laser turns off mid-chase", () => {
	const h = harness();
	let state: PetState = "Walking";
	const pos = { x: 100, y: 50 };
	let active = true;
	const drops: PetState[] = [];

	startLaserLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => "left",
		isLaserActive: () => active,
		getCursor: () => ({ x: 300, y: 0 }),
		onDepart: () => {},
		onStep: () => {},
		onDropChase: (next) => {
			state = next.currentState;
			drops.push(next.currentState);
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
	});

	h.fireTimer();
	assert.ok(h.hasFrame);
	active = false;
	h.advance(100);

	assert.deepEqual(drops, ["IdleSit"]);
	assert.equal(h.hasFrame, false);
	assert.ok(h.hasTimer, "resumes polling for the next chase after settling");
});

test("startLaserLoop abandons a chase if the state changes mid-step (e.g. a drag)", () => {
	const h = harness();
	let state: PetState = "IdleSit";

	startLaserLoop({
		getState: () => state,
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		isLaserActive: () => true,
		getCursor: () => ({ x: 300, y: 0 }),
		onDepart: () => {
			state = "Walking";
		},
		onStep: () => {},
		onDropChase: () => {
			throw new Error("should not settle — the drag already handled it");
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
	});

	h.fireTimer();
	assert.ok(h.hasFrame);
	state = "Dragged";
	h.advance(100);

	assert.equal(h.hasFrame, false);
	assert.ok(h.hasTimer);
});

test("stopping the laser loop cancels pending work", () => {
	const h = harness();
	const stop = startLaserLoop({
		getState: () => "IdleSit",
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		isLaserActive: () => false,
		getCursor: () => null,
		onDepart: () => {},
		onStep: () => {},
		onDropChase: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
	});

	assert.ok(h.hasTimer);
	stop();
	assert.equal(h.hasTimer, false);
});

test("LASER_CHECK_MS is a short poll, not a per-frame check", () => {
	assert.ok(LASER_CHECK_MS > 0 && LASER_CHECK_MS <= 1000);
});
