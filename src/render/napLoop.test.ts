import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetState } from "./petState.ts";
import {
	isDaytime,
	NAP_CHECK_MAX_MS,
	NAP_CHECK_MIN_MS,
	NAP_MAX_MS,
	NAP_MIN_MS,
	napCheckDelayMs,
	napDurationMs,
	shouldNap,
	startNapLoop,
} from "./napLoop.ts";

test("napCheckDelayMs and napDurationMs stay within their ranges", () => {
	assert.equal(
		napCheckDelayMs(() => 0),
		NAP_CHECK_MIN_MS,
	);
	assert.ok(napCheckDelayMs(() => 0.999999) < NAP_CHECK_MAX_MS);
	assert.equal(
		napDurationMs(() => 0),
		NAP_MIN_MS,
	);
	assert.ok(napDurationMs(() => 0.999999) < NAP_MAX_MS);
});

test("isDaytime covers 7am to 10pm", () => {
	assert.equal(isDaytime(new Date(2026, 8, 6, 6, 59)), false);
	assert.equal(isDaytime(new Date(2026, 8, 6, 7, 0)), true);
	assert.equal(isDaytime(new Date(2026, 8, 6, 21, 59)), true);
	assert.equal(isDaytime(new Date(2026, 8, 6, 22, 0)), false);
	assert.equal(isDaytime(new Date(2026, 8, 6, 2, 0)), false);
});

test("shouldNap requires daytime, an eligible state, and the chance roll", () => {
	assert.equal(
		shouldNap("IdleSit", true, () => 0),
		true,
	);
	assert.equal(
		shouldNap("IdleSit", false, () => 0),
		false,
	);
	assert.equal(
		shouldNap("Walking", true, () => 0),
		false,
	);
	assert.equal(
		shouldNap("AtBase", true, () => 0),
		true,
	);
	assert.equal(
		shouldNap("IdleSit", true, () => 0.5),
		false,
	);
});

function harness() {
	let pending: (() => void) | null = null;
	return {
		setTimer(fn: () => void) {
			pending = fn;
			return 1;
		},
		clearTimer() {
			pending = null;
		},
		fire() {
			const fn = pending;
			pending = null;
			fn?.();
		},
		get hasTimer() {
			return pending != null;
		},
	};
}

const day = () => new Date(2026, 8, 6, 12, 0);

test("startNapLoop naps then wakes to IdleSit", () => {
	const h = harness();
	let state: PetState = "IdleSit";
	const events: string[] = [];

	startNapLoop({
		getState: () => state,
		onNap: () => {
			state = "Napping";
			events.push("nap");
		},
		onWake: () => {
			state = "IdleSit";
			events.push("wake");
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		now: day,
		rng: () => 0,
	});

	h.fire();
	assert.deepEqual(events, ["nap"]);
	assert.equal(state, "Napping");

	h.fire();
	assert.deepEqual(events, ["nap", "wake"]);
	assert.equal(state, "IdleSit");
	assert.ok(h.hasTimer);
});

test("startNapLoop keeps checking when the roll fails or the pet is busy", () => {
	const h = harness();
	let napped = false;

	startNapLoop({
		getState: () => "Walking",
		onNap: () => {
			napped = true;
		},
		onWake: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		now: day,
		rng: () => 0,
	});

	h.fire();
	assert.equal(napped, false);
	assert.ok(h.hasTimer);
});

test("startNapLoop does not nap at night", () => {
	const h = harness();
	let napped = false;

	startNapLoop({
		getState: () => "IdleSit",
		onNap: () => {
			napped = true;
		},
		onWake: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		now: () => new Date(2026, 8, 6, 23, 0),
		rng: () => 0,
	});

	h.fire();
	assert.equal(napped, false);
	assert.ok(h.hasTimer);
});

test("stopping the nap loop cancels the pending timer", () => {
	const h = harness();
	const stop = startNapLoop({
		getState: () => "IdleSit",
		onNap: () => {},
		onWake: () => {},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		now: day,
		rng: () => 0,
	});

	assert.ok(h.hasTimer);
	stop();
	assert.equal(h.hasTimer, false);
});
