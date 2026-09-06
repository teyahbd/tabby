import assert from "node:assert/strict";
import { test } from "node:test";
import type { PetState } from "./petState.ts";
import { canPet, startPetting } from "./petting.ts";

interface FakeEvent {
	type: string;
	clientX?: number;
	clientY?: number;
	button?: number;
}

function fakeTarget() {
	const listeners = new Map<string, Set<(e: FakeEvent) => void>>();
	return {
		addEventListener(type: string, fn: (e: FakeEvent) => void) {
			let set = listeners.get(type);
			if (!set) {
				set = new Set();
				listeners.set(type, set);
			}
			set.add(fn);
		},
		removeEventListener(type: string, fn: (e: FakeEvent) => void) {
			listeners.get(type)?.delete(fn);
		},
		emit(e: FakeEvent) {
			for (const fn of [...(listeners.get(e.type) ?? [])]) fn(e);
		},
		count(type: string) {
			return listeners.get(type)?.size ?? 0;
		},
	};
}

test("canPet reacts everywhere except mid-drag, sleep, nap, and eat", () => {
	for (const s of [
		"IdleSit",
		"IdleLie",
		"Walking",
		"AtBase",
		"ReturningToBase",
	] as PetState[]) {
		assert.ok(canPet(s), s);
	}
	for (const s of ["Dragged", "Sleeping", "Napping", "Eating"] as PetState[]) {
		assert.equal(canPet(s), false, s);
	}
});

function harness(state: PetState = "IdleSit") {
	const sprite = fakeTarget();
	let pets = 0;
	const stop = startPetting({
		sprite: sprite as unknown as EventTarget,
		getState: () => state,
		onPet: () => {
			pets++;
		},
	});
	return {
		sprite,
		stop,
		get pets() {
			return pets;
		},
	};
}

test("a click in place pets the cat", () => {
	const h = harness();
	h.sprite.emit({ type: "pointerdown", clientX: 10, clientY: 10 });
	h.sprite.emit({ type: "click", clientX: 11, clientY: 12 });
	assert.equal(h.pets, 1);
});

test("a click that drifted past the tolerance does not pet (it was a drag)", () => {
	const h = harness();
	h.sprite.emit({ type: "pointerdown", clientX: 10, clientY: 10 });
	h.sprite.emit({ type: "click", clientX: 40, clientY: 40 });
	assert.equal(h.pets, 0);
});

test("clicks in suppressed states are ignored", () => {
	const h = harness("Sleeping");
	h.sprite.emit({ type: "pointerdown", clientX: 10, clientY: 10 });
	h.sprite.emit({ type: "click", clientX: 10, clientY: 10 });
	assert.equal(h.pets, 0);
});

test("secondary-button presses never arm a pet", () => {
	const h = harness();
	h.sprite.emit({ type: "pointerdown", clientX: 10, clientY: 10, button: 2 });
	h.sprite.emit({ type: "click", clientX: 200, clientY: 200 });
	assert.equal(h.pets, 0);
});

test("stop() detaches both listeners", () => {
	const h = harness();
	h.stop();
	assert.equal(h.sprite.count("pointerdown"), 0);
	assert.equal(h.sprite.count("click"), 0);
});
