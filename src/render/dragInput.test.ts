import assert from "node:assert/strict";
import { test } from "node:test";
import { basePosition, PET_SIZE } from "./layout.ts";
import type { PetState } from "./petState.ts";
import {
	BED_SNAP_RADIUS,
	canGrab,
	clampToViewport,
	dropState,
	startDragInput,
} from "./dragInput.ts";

const VIEWPORT = { width: 1000, height: 800 };

test("canGrab covers idle-ish states and AtBase, not Sleeping or Eating", () => {
	for (const s of [
		"IdleSit",
		"IdleLie",
		"Walking",
		"Napping",
		"ReturningToBase",
		"AtBase",
	] as PetState[]) {
		assert.ok(canGrab(s), s);
	}
	for (const s of ["Sleeping", "Eating", "Dragged"] as PetState[]) {
		assert.equal(canGrab(s), false, s);
	}
});

test("clampToViewport keeps the sprite fully on screen", () => {
	assert.deepEqual(clampToViewport({ x: -50, y: -50 }, VIEWPORT), {
		x: 0,
		y: 0,
	});
	assert.deepEqual(clampToViewport({ x: 9999, y: 9999 }, VIEWPORT), {
		x: VIEWPORT.width - PET_SIZE,
		y: VIEWPORT.height - PET_SIZE,
	});
});

test("dropState snaps to AtBase only within the bed radius", () => {
	const base = basePosition(VIEWPORT);
	assert.equal(dropState(base, VIEWPORT), "AtBase");
	assert.equal(
		dropState({ x: base.x - BED_SNAP_RADIUS + 1, y: base.y }, VIEWPORT),
		"AtBase",
	);
	assert.equal(
		dropState({ x: base.x - BED_SNAP_RADIUS - 1, y: base.y }, VIEWPORT),
		"IdleSit",
	);
	assert.equal(dropState({ x: 0, y: 0 }, VIEWPORT), "IdleSit");
});

interface FakeEvent {
	type: string;
	clientX?: number;
	clientY?: number;
	button?: number;
	isPrimary?: boolean;
	preventDefault?: () => void;
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

function harness(state: PetState = "IdleSit") {
	const sprite = fakeTarget();
	const moveTarget = fakeTarget();
	let pos = { x: 100, y: 100 };
	const events: string[] = [];

	const stop = startDragInput({
		sprite: sprite as unknown as EventTarget,
		moveTarget: moveTarget as unknown as EventTarget,
		getState: () => state,
		getPosition: () => pos,
		getViewport: () => VIEWPORT,
		onGrab: () => {
			state = "Dragged";
			events.push("grab");
		},
		onDrag: (next) => {
			pos = next;
			events.push("drag");
		},
		onDrop: (next) => {
			state = next.currentState;
			pos = { x: next.x, y: next.y };
			events.push(`drop:${next.currentState}`);
		},
	});

	return {
		sprite,
		moveTarget,
		events,
		stop,
		getPos: () => pos,
		getState: () => state,
	};
}

test("a small click that never crosses the threshold does not grab", () => {
	const h = harness();
	h.sprite.emit({
		type: "pointerdown",
		clientX: 0,
		clientY: 0,
		isPrimary: true,
	});
	h.moveTarget.emit({ type: "pointermove", clientX: 2, clientY: 1 });
	h.moveTarget.emit({ type: "pointerup", clientX: 2, clientY: 1 });

	assert.deepEqual(h.events, []);
	assert.equal(h.moveTarget.count("pointermove"), 0);
});

test("dragging past the threshold grabs, follows the pointer, and drops as IdleSit", () => {
	const h = harness();
	h.sprite.emit({
		type: "pointerdown",
		clientX: 0,
		clientY: 0,
		isPrimary: true,
	});
	h.moveTarget.emit({ type: "pointermove", clientX: 40, clientY: 30 });
	h.moveTarget.emit({ type: "pointermove", clientX: 60, clientY: 30 });
	h.moveTarget.emit({ type: "pointerup", clientX: 60, clientY: 30 });

	assert.deepEqual(h.events, ["grab", "drag", "drag", "drop:IdleSit"]);
	assert.deepEqual(h.getPos(), { x: 160, y: 130 });
	assert.equal(h.getState(), "IdleSit");
	assert.equal(h.moveTarget.count("pointermove"), 0);
});

test("dropping near the bed settles into AtBase", () => {
	const h = harness();
	const base = basePosition(VIEWPORT);
	h.sprite.emit({
		type: "pointerdown",
		clientX: 0,
		clientY: 0,
		isPrimary: true,
	});
	h.moveTarget.emit({
		type: "pointermove",
		clientX: base.x - 100 + 5,
		clientY: base.y - 100,
	});
	h.moveTarget.emit({
		type: "pointerup",
		clientX: base.x - 100 + 5,
		clientY: base.y - 100,
	});

	assert.equal(h.getState(), "AtBase");
	assert.ok(h.events.includes("drop:AtBase"));
});

test("a grab is ignored from a non-grabbable state", () => {
	const h = harness("Sleeping");
	h.sprite.emit({
		type: "pointerdown",
		clientX: 0,
		clientY: 0,
		isPrimary: true,
	});
	h.moveTarget.emit({ type: "pointermove", clientX: 60, clientY: 60 });

	assert.deepEqual(h.events, []);
	assert.equal(h.moveTarget.count("pointermove"), 0);
});

test("secondary buttons are ignored", () => {
	const h = harness();
	h.sprite.emit({ type: "pointerdown", clientX: 0, clientY: 0, button: 2 });
	assert.equal(h.moveTarget.count("pointerup"), 0);
});

test("pointercancel ends the drag, settling the pet where it lies", () => {
	const h = harness();
	h.sprite.emit({
		type: "pointerdown",
		clientX: 0,
		clientY: 0,
		isPrimary: true,
	});
	h.moveTarget.emit({ type: "pointermove", clientX: 60, clientY: 60 });
	h.moveTarget.emit({ type: "pointercancel", clientX: 60, clientY: 60 });

	assert.deepEqual(h.events, ["grab", "drag", "drop:IdleSit"]);
});

test("stop() detaches the pointerdown listener", () => {
	const h = harness();
	h.stop();
	assert.equal(h.sprite.count("pointerdown"), 0);
});
