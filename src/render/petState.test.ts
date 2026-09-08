import assert from "node:assert/strict";
import { test } from "node:test";
import { basePosition, bowlFeedSpot, PET_SIZE } from "./layout.ts";
import {
	initialSnapshot,
	repositionOnResize,
	resumeSnapshot,
} from "./petState.ts";

const viewport = { width: 1000, height: 800 };

test("first run starts sitting at the base position", () => {
	const snap = initialSnapshot(viewport, 100);
	assert.deepEqual(snap, {
		...basePosition(viewport),
		facing: "left",
		currentState: "IdleSit",
		stateEnteredAt: 100,
	});
});

test("resume falls back to the initial snapshot for missing or malformed state", () => {
	assert.deepEqual(
		resumeSnapshot(null, viewport, 5),
		initialSnapshot(viewport, 5),
	);
	assert.deepEqual(
		resumeSnapshot({ x: 1 }, viewport, 5),
		initialSnapshot(viewport, 5),
	);
});

test("stable states resume exactly as saved", () => {
	for (const currentState of ["Napping", "Eating"] as const) {
		const saved = {
			x: 10,
			y: 20,
			facing: "right" as const,
			currentState,
			stateEnteredAt: 42,
		};
		assert.deepEqual(resumeSnapshot(saved, viewport, 999), saved);
	}
});

test("transient states collapse to IdleSit at the saved position", () => {
	for (const currentState of [
		"Walking",
		"Dragged",
		"ReturningToBase",
	] as const) {
		const saved = {
			x: 10,
			y: 20,
			facing: "right" as const,
			currentState,
			stateEnteredAt: 42,
		};
		assert.deepEqual(resumeSnapshot(saved, viewport, 999), {
			x: 10,
			y: 20,
			facing: "right",
			currentState: "IdleSit",
			stateEnteredAt: 999,
		});
	}
});

test("repositionOnResize re-anchors resting states to their layout spot", () => {
	const small = { width: 500, height: 400 };
	for (const currentState of ["AtBase", "Sleeping"] as const) {
		const saved = {
			x: 900,
			y: 700,
			facing: "left" as const,
			currentState,
			stateEnteredAt: 1,
		};
		const next = repositionOnResize(saved, small);
		assert.deepEqual({ x: next.x, y: next.y }, basePosition(small));
		assert.equal(next.currentState, currentState);
	}

	const eating = {
		x: 900,
		y: 700,
		facing: "left" as const,
		currentState: "Eating" as const,
		stateEnteredAt: 1,
	};
	const nextEating = repositionOnResize(eating, small);
	assert.deepEqual({ x: nextEating.x, y: nextEating.y }, bowlFeedSpot(small));
});

test("repositionOnResize clamps other states back onto the screen", () => {
	const saved = {
		x: 900,
		y: 700,
		facing: "left" as const,
		currentState: "IdleSit" as const,
		stateEnteredAt: 1,
	};
	const next = repositionOnResize(saved, { width: 500, height: 400 });
	assert.deepEqual(
		{ x: next.x, y: next.y },
		{ x: 500 - PET_SIZE, y: 400 - PET_SIZE },
	);
});

test("repositionOnResize returns the same object when nothing moves", () => {
	const saved = {
		x: 100,
		y: 100,
		facing: "left" as const,
		currentState: "IdleSit" as const,
		stateEnteredAt: 1,
	};
	assert.equal(repositionOnResize(saved, viewport), saved);
});
