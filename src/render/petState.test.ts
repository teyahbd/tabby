import assert from "node:assert/strict";
import { test } from "node:test";
import { basePosition } from "./layout.ts";
import { initialSnapshot, resumeSnapshot } from "./petState.ts";

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
	const saved = {
		x: 10,
		y: 20,
		facing: "right" as const,
		currentState: "Napping" as const,
		stateEnteredAt: 42,
	};
	assert.deepEqual(resumeSnapshot(saved, viewport, 999), saved);
});

test("transient states collapse to IdleSit at the saved position", () => {
	for (const currentState of [
		"Walking",
		"Dragged",
		"Eating",
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
