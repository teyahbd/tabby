import assert from "node:assert/strict";
import { test } from "node:test";
import { basePosition } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";
import { isNight, startNightLoop } from "./nightLoop.ts";

test("isNight covers 10pm to 7am", () => {
	assert.equal(isNight(new Date(2026, 8, 6, 21, 59)), false);
	assert.equal(isNight(new Date(2026, 8, 6, 22, 0)), true);
	assert.equal(isNight(new Date(2026, 8, 6, 3, 0)), true);
	assert.equal(isNight(new Date(2026, 8, 6, 6, 59)), true);
	assert.equal(isNight(new Date(2026, 8, 6, 7, 0)), false);
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

const viewport = { width: 1000, height: 800 };
const night = () => new Date(2026, 8, 6, 23, 0);
const morning = () => new Date(2026, 8, 6, 8, 0);
const nowDateRef = { value: morning() };

function scene(state: PetState, nowDate: () => Date, pos = { x: 100, y: 100 }) {
	const h = harness();
	let current = state;
	let facing: Facing = "right";
	let position = pos;
	const events: string[] = [];

	const stop = startNightLoop({
		getState: () => current,
		getPosition: () => position,
		getFacing: () => facing,
		getViewport: () => viewport,
		onReturnDepart: (next) => {
			current = "ReturningToBase";
			facing = next.facing;
			events.push("depart");
		},
		onReturnStep: (next) => {
			position = next;
		},
		onSleep: (next) => {
			current = "Sleeping";
			position = next;
			events.push("sleep");
		},
		onWake: () => {
			current = "IdleSit";
			events.push("wake");
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowDate,
	});

	return {
		h,
		events,
		stop,
		get state() {
			return current;
		},
		get position() {
			return position;
		},
		setState(s: PetState) {
			current = s;
		},
	};
}

test("night on mount from an idle state sleeps in bed without walking", () => {
	const s = scene("IdleSit", night);
	assert.deepEqual(s.events, ["sleep"]);
	assert.equal(s.state, "Sleeping");
	assert.equal(s.h.hasFrame, false);
	assert.deepEqual(s.position, basePosition(viewport));
	assert.ok(s.h.hasTimer);
});

test("nightfall while running walks the pet back to base and sleeps", () => {
	nowDateRef.value = morning();
	const s = scene("IdleSit", () => nowDateRef.value);
	nowDateRef.value = night();
	s.h.fireTimer();

	assert.deepEqual(s.events, ["depart"]);
	assert.equal(s.state, "ReturningToBase");

	for (let i = 0; i < 500 && s.h.hasFrame; i++) s.h.advance(100);

	assert.deepEqual(s.events, ["depart", "sleep"]);
	assert.deepEqual(s.position, basePosition(viewport));
	assert.ok(s.h.hasTimer);
});

test("night with the pet already at base sleeps in place", () => {
	const s = scene("AtBase", night, { x: 900, y: 700 });
	assert.deepEqual(s.events, ["sleep"]);
	assert.deepEqual(s.position, { x: 900, y: 700 });
	assert.ok(s.h.hasTimer);
});

test("the return walk bails if the pet is grabbed mid-way", () => {
	nowDateRef.value = morning();
	const s = scene("IdleLie", () => nowDateRef.value);
	nowDateRef.value = night();
	s.h.fireTimer();
	s.h.advance(100);
	assert.equal(s.h.hasFrame, true);

	s.setState("Dragged");
	s.h.advance(100);

	assert.equal(s.h.hasFrame, false);
	assert.ok(s.h.hasTimer);
	assert.deepEqual(s.events, ["depart"]);
});

test("stopping the night loop mid-walk cancels pending work", () => {
	nowDateRef.value = morning();
	const s = scene("IdleSit", () => nowDateRef.value);
	nowDateRef.value = night();
	s.h.fireTimer();
	assert.ok(s.h.hasFrame);
	s.stop();
	assert.equal(s.h.hasFrame, false);
	assert.equal(s.h.hasTimer, false);
});

test("morning wakes a sleeping pet to IdleSit", () => {
	const s = scene("Sleeping", morning);
	assert.deepEqual(s.events, ["wake"]);
	assert.equal(s.state, "IdleSit");
	assert.ok(s.h.hasTimer);
});

test("daytime leaves an awake pet alone", () => {
	const s = scene("IdleSit", morning);
	assert.deepEqual(s.events, []);
	assert.ok(s.h.hasTimer);

	s.h.fireTimer();
	assert.deepEqual(s.events, []);
	assert.ok(s.h.hasTimer);
});

test("Eating and Dragged are left undisturbed at night", () => {
	for (const state of ["Eating", "Dragged"] as PetState[]) {
		const s = scene(state, night);
		assert.deepEqual(s.events, []);
		assert.ok(s.h.hasTimer);
	}
});

test("stopping the night loop cancels pending work", () => {
	const s = scene("IdleSit", night);
	assert.equal(s.state, "Sleeping");
	s.stop();
	assert.equal(s.h.hasFrame, false);
	assert.equal(s.h.hasTimer, false);
});
