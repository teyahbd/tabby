import assert from "node:assert/strict";
import { test } from "node:test";
import { PET_SIZE } from "./layout.ts";
import type { PetState } from "./petState.ts";
import {
	canChaseLaser,
	chaseTarget,
	LASER_CHECK_MS,
	startLaserLoop,
} from "./laserLoop.ts";

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

test("chaseTarget sits right of the cursor on the right half of the screen, left on the left half", () => {
	const viewport = { width: 1000, height: 800 };
	assert.deepEqual(chaseTarget({ x: 800, y: 50 }, viewport), { x: 800, y: 50 });
	assert.deepEqual(chaseTarget({ x: 200, y: 50 }, viewport), {
		x: 200 - PET_SIZE,
		y: 50,
	});
	assert.deepEqual(chaseTarget({ x: 500, y: 50 }, viewport), { x: 500, y: 50 });
});

test("chaseTarget stays fully on screen even when the cursor is right at an edge", () => {
	const viewport = { width: 1000, height: 800 };
	assert.deepEqual(chaseTarget({ x: 999, y: 50 }, viewport), {
		x: 1000 - PET_SIZE,
		y: 50,
	});
	assert.deepEqual(chaseTarget({ x: 10, y: 50 }, viewport), { x: 0, y: 50 });
	assert.deepEqual(chaseTarget({ x: 500, y: 799 }, viewport), {
		x: 500,
		y: 800 - PET_SIZE,
	});
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

const VIEWPORT = { width: 500, height: 800 };

test("startLaserLoop does nothing while inactive, and keeps polling", () => {
	const h = harness();
	let departed = false;

	startLaserLoop({
		getState: () => "IdleSit",
		getPosition: () => ({ x: 0, y: 0 }),
		getFacing: () => "left",
		getViewport: () => VIEWPORT,
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
		getViewport: () => VIEWPORT,
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

test("startLaserLoop keeps facing the travel direction mid-run, only flipping to face the cursor once arrived", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	let pos = { x: 0, y: 0 };
	let facing: "left" | "right" = "left";

	startLaserLoop({
		getState: () => state,
		getPosition: () => pos,
		getFacing: () => facing,
		getViewport: () => VIEWPORT,
		isLaserActive: () => true,
		getCursor: () => ({ x: 300, y: 0 }),
		onDepart: (next) => {
			state = "Walking";
			facing = next.facing;
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
	assert.equal(facing, "right");

	h.advance(2_500);
	assert.equal(facing, "right");

	for (let i = 0; i < 200 && h.hasFrame; i++) h.advance(100);
	assert.equal(pos.x, 300);
	assert.equal(facing, "left");
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
		getViewport: () => VIEWPORT,
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
		getViewport: () => VIEWPORT,
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
		getViewport: () => VIEWPORT,
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
