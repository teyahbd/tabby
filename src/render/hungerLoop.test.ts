import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AWAY_EAT_THRESHOLD_MS,
	catchUpAwayMeal,
	DEFAULT_HUNGER,
	EAT_DURATION_MS,
	HUNGER_COOLDOWN_MS,
	type HungerState,
	isHungerState,
	isHungry,
	startHungerLoop,
} from "./hungerLoop.ts";
import { bowlFeedSpot } from "./layout.ts";
import type { Facing, PetState } from "./petState.ts";

test("isHungry is true with no prior meal and after the cooldown", () => {
	assert.equal(isHungry(null, 0), true);
	assert.equal(isHungry(1_000, 1_000 + HUNGER_COOLDOWN_MS - 1), false);
	assert.equal(isHungry(1_000, 1_000 + HUNGER_COOLDOWN_MS), true);
});

test("isHungerState rejects malformed values", () => {
	assert.equal(isHungerState({ bowlFilled: true, lastAteAt: null }), true);
	assert.equal(isHungerState({ bowlFilled: true, lastAteAt: 5 }), true);
	assert.equal(isHungerState({ bowlFilled: "yes" }), false);
	assert.equal(isHungerState(null), false);
	assert.equal(
		isHungerState({ bowlFilled: true, lastAteAt: null, bowlFilledAt: "no" }),
		false,
	);
});

const HOUR = 60 * 60 * 1_000;

test("catchUpAwayMeal leaves an empty bowl alone", () => {
	assert.equal(catchUpAwayMeal(DEFAULT_HUNGER, 10 * HOUR), null);
});

test("catchUpAwayMeal ignores a short absence", () => {
	const now = 10 * HOUR;
	const hunger: HungerState = {
		bowlFilled: true,
		lastAteAt: null,
		bowlFilledAt: now - 5 * HOUR,
		lastSeenAt: now - AWAY_EAT_THRESHOLD_MS + 1,
	};
	assert.equal(catchUpAwayMeal(hunger, now), null);
});

test("catchUpAwayMeal empties the bowl and backdates the meal after a long absence", () => {
	const now = 10 * HOUR;
	const filledAt = now - 6 * HOUR;
	const hunger: HungerState = {
		bowlFilled: true,
		lastAteAt: null,
		bowlFilledAt: filledAt,
		lastSeenAt: now - 4 * HOUR,
	};
	assert.deepEqual(catchUpAwayMeal(hunger, now), {
		bowlFilled: false,
		lastAteAt: filledAt + EAT_DURATION_MS,
		bowlFilledAt: null,
		lastSeenAt: now - 4 * HOUR,
	});
});

test("catchUpAwayMeal waits out the cooldown from the previous meal", () => {
	const now = 10 * HOUR;
	const lastAteAt = now - 2 * HOUR;
	const hunger: HungerState = {
		bowlFilled: true,
		lastAteAt,
		bowlFilledAt: now - 90 * 60 * 1_000,
		lastSeenAt: now - 80 * 60 * 1_000,
	};
	assert.equal(catchUpAwayMeal(hunger, now), null);

	const later = lastAteAt + HUNGER_COOLDOWN_MS + EAT_DURATION_MS;
	assert.deepEqual(catchUpAwayMeal(hunger, later)?.lastAteAt, later);
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

function scene(
	state: PetState,
	hunger: HungerState,
	pos = { x: 100, y: 100 },
	enteredAt = 0,
) {
	const h = harness();
	let current = state;
	let facing: Facing = "right";
	let position = pos;
	let stored = hunger;
	const events: string[] = [];

	const stop = startHungerLoop({
		getState: () => current,
		getHunger: () => stored,
		getPosition: () => position,
		getFacing: () => facing,
		getViewport: () => viewport,
		getEnteredAt: () => enteredAt,
		onEatStart: (next) => {
			current = "Eating";
			facing = next.facing;
			events.push("start");
		},
		onEatStep: (next) => {
			position = next;
		},
		onEatArrive: (next) => {
			position = next;
		},
		onFinishEating: (next) => {
			current = "IdleSit";
			position = { x: next.x, y: next.y };
			stored = {
				...stored,
				bowlFilled: false,
				bowlFilledAt: null,
				lastAteAt: next.ateAt,
			};
			events.push("finish");
		},
		setTimer: h.setTimer,
		clearTimer: h.clearTimer,
		raf: h.raf,
		cancelRaf: h.cancelRaf,
		now: h.now,
		nowMs: () => 10_000_000,
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
		get stored() {
			return stored;
		},
		setState(s: PetState) {
			current = s;
		},
	};
}

const filled: HungerState = {
	bowlFilled: true,
	lastAteAt: null,
	bowlFilledAt: 9_000_000,
	lastSeenAt: 10_000_000,
};

test("a hungry pet with a full bowl walks over, eats, and empties the bowl", () => {
	const s = scene("IdleSit", filled);
	assert.deepEqual(s.events, ["start"]);
	assert.equal(s.state, "Eating");

	for (let i = 0; i < 500 && s.h.hasFrame; i++) s.h.advance(50);
	assert.deepEqual(s.events, ["start"]);

	s.h.fireTimer();
	assert.deepEqual(s.events, ["start", "finish"]);
	assert.equal(s.state, "IdleSit");
	assert.deepEqual(s.position, bowlFeedSpot(viewport));
	assert.deepEqual(s.stored, {
		bowlFilled: false,
		lastAteAt: 10_000_000,
		bowlFilledAt: null,
		lastSeenAt: 10_000_000,
	});
	assert.ok(s.h.hasTimer);
});

test("an empty bowl leaves the pet alone", () => {
	const s = scene("IdleSit", DEFAULT_HUNGER);
	assert.deepEqual(s.events, []);
	assert.ok(s.h.hasTimer);
	s.h.fireTimer();
	assert.deepEqual(s.events, []);
});

test("a full bowl during the cooldown window is ignored", () => {
	const s = scene("IdleSit", {
		...filled,
		lastAteAt: 10_000_000 - 1,
	});
	assert.deepEqual(s.events, []);
	assert.ok(s.h.hasTimer);
});

test("a wandering pet is redirected to the bowl", () => {
	const s = scene("Walking", filled);
	assert.deepEqual(s.events, ["start"]);
	assert.equal(s.state, "Eating");
});

test("a resumed Eating pet finishes the meal instead of restarting it", () => {
	const s = scene(
		"Eating",
		filled,
		bowlFeedSpot(viewport),
		10_000_000 - 20_000,
	);
	assert.deepEqual(s.events, []);
	assert.equal(s.state, "Eating");

	for (let i = 0; i < 500 && s.h.hasFrame; i++) s.h.advance(50);
	s.h.fireTimer();

	assert.deepEqual(s.events, ["finish"]);
	assert.equal(s.state, "IdleSit");
	assert.deepEqual(s.stored, {
		bowlFilled: false,
		lastAteAt: 10_000_000,
		bowlFilledAt: null,
		lastSeenAt: 10_000_000,
	});
});

test("a resumed Eating pet parks at the bowl so a later resume does not re-walk", () => {
	const s = scene("Eating", filled, { x: 100, y: 100 }, 10_000_000 - 20_000);
	for (let i = 0; i < 500 && s.h.hasFrame; i++) s.h.advance(50);
	assert.deepEqual(s.position, bowlFeedSpot(viewport));
});

test("a resumed Eating pet whose meal already elapsed finishes immediately", () => {
	const s = scene("Eating", filled, bowlFeedSpot(viewport), 0);
	for (let i = 0; i < 500 && s.h.hasFrame; i++) s.h.advance(50);
	s.h.fireTimer();
	assert.deepEqual(s.events, ["finish"]);
});

test("napping and sleeping pets are not disturbed", () => {
	for (const state of ["Napping", "Sleeping", "Dragged"] as PetState[]) {
		const s = scene(state, filled);
		assert.deepEqual(s.events, []);
		assert.ok(s.h.hasTimer);
	}
});

test("the walk to the bowl bails if the pet is grabbed", () => {
	const s = scene("IdleLie", filled);
	s.h.advance(50);
	assert.ok(s.h.hasFrame);
	s.setState("Dragged");
	s.h.advance(50);
	assert.equal(s.h.hasFrame, false);
	assert.ok(s.h.hasTimer);
	assert.deepEqual(s.events, ["start"]);
});

test("the bowl stays full until the pet actually finishes eating", () => {
	const s = scene("IdleSit", filled);
	for (let i = 0; i < 500 && s.h.hasFrame; i++) s.h.advance(50);
	assert.equal(s.stored.bowlFilled, true);
	s.h.fireTimer();
	assert.equal(s.stored.bowlFilled, false);
});

test("stopping the hunger loop cancels pending work", () => {
	const s = scene("IdleSit", filled);
	assert.ok(s.h.hasFrame);
	s.stop();
	assert.equal(s.h.hasFrame, false);
	assert.equal(s.h.hasTimer, false);
});
