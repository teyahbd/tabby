import assert from "node:assert/strict";
import { test } from "node:test";
import {
	IDLE_MAX_MS,
	IDLE_MIN_MS,
	idleDelayMs,
	isIdlePose,
	nextIdlePose,
	startIdleLoop,
} from "./idleLoop.ts";

test("nextIdlePose flips between the two idle poses", () => {
	assert.equal(nextIdlePose("IdleSit", () => 0).currentState, "IdleLie");
	assert.equal(nextIdlePose("IdleLie", () => 0).currentState, "IdleSit");
});

test("nextIdlePose randomizes facing", () => {
	assert.equal(nextIdlePose("IdleSit", () => 0.1).facing, "left");
	assert.equal(nextIdlePose("IdleSit", () => 0.9).facing, "right");
});

test("idleDelayMs stays within the configured range", () => {
	assert.equal(
		idleDelayMs(() => 0),
		IDLE_MIN_MS,
	);
	assert.ok(idleDelayMs(() => 0.999999) < IDLE_MAX_MS);
	assert.ok(idleDelayMs(() => 0.5) >= IDLE_MIN_MS);
});

test("isIdlePose only matches the two idle poses", () => {
	assert.ok(isIdlePose("IdleSit"));
	assert.ok(isIdlePose("IdleLie"));
	assert.ok(!isIdlePose("Walking"));
});

function fakeTimers() {
	let next = 1;
	const pending = new Map<number, () => void>();
	return {
		setTimer(fn: () => void) {
			const id = next++;
			pending.set(id, fn);
			return id;
		},
		clearTimer(id: number) {
			pending.delete(id);
		},
		fireLast() {
			const id = Math.max(...pending.keys());
			const fn = pending.get(id)!;
			pending.delete(id);
			fn();
		},
		get size() {
			return pending.size;
		},
	};
}

test("startIdleLoop flips state on each tick and re-arms", () => {
	const timers = fakeTimers();
	let state = "IdleSit" as "IdleSit" | "IdleLie";
	const flips: string[] = [];

	const stop = startIdleLoop({
		getState: () => state,
		onFlip: ({ currentState }) => {
			state = currentState as typeof state;
			flips.push(currentState);
		},
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		rng: () => 0.5,
	});

	timers.fireLast();
	timers.fireLast();
	assert.deepEqual(flips, ["IdleLie", "IdleSit"]);
	assert.equal(timers.size, 1);

	stop();
	assert.equal(timers.size, 0);
});

test("startIdleLoop does not flip when the pet left an idle pose", () => {
	const timers = fakeTimers();
	const flips: string[] = [];

	startIdleLoop({
		getState: () => "Walking",
		onFlip: ({ currentState }) => flips.push(currentState),
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
		rng: () => 0.5,
	});

	timers.fireLast();
	assert.deepEqual(flips, []);
	assert.equal(timers.size, 1);
});
