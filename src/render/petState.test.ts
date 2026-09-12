import assert from "node:assert/strict";
import { test } from "node:test";
import { basePosition, eatingSpot, PET_SIZE } from "./layout.ts";
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

test("resume clamps a saved position that's now off-screen (Fix 3)", () => {
	// Simulates reloading the extension into a smaller page than the one the
	// position was last saved against.
	const small = { width: 500, height: 400 };
	for (const currentState of ["IdleSit", "Napping", "AtBase"] as const) {
		const saved = {
			x: 900,
			y: 700,
			facing: "left" as const,
			currentState,
			stateEnteredAt: 1,
		};
		const resumed = resumeSnapshot(saved, small, 999);
		assert.deepEqual(
			{ x: resumed.x, y: resumed.y },
			{ x: small.width - PET_SIZE, y: small.height - PET_SIZE },
		);
		assert.equal(resumed.currentState, currentState);
	}

	// Eating clamps back on screen too, but keeps its saved spot rather than
	// jumping straight to the bowl — hungerLoop's resume walk still needs a
	// real starting position to walk from.
	const eating = {
		x: 900,
		y: 700,
		facing: "left" as const,
		currentState: "Eating" as const,
		stateEnteredAt: 1,
	};
	const resumedEating = resumeSnapshot(eating, small, 999);
	assert.deepEqual(
		{ x: resumedEating.x, y: resumedEating.y },
		{ x: small.width - PET_SIZE, y: small.height - PET_SIZE },
	);
	assert.equal(resumedEating.currentState, "Eating");
});

test("Dragged always collapses to IdleSit at the saved position (Fix 5)", () => {
	const saved = {
		x: 10,
		y: 20,
		facing: "right" as const,
		currentState: "Dragged" as const,
		stateEnteredAt: 42,
	};
	assert.deepEqual(resumeSnapshot(saved, viewport, 999), {
		x: 10,
		y: 20,
		facing: "right",
		currentState: "IdleSit",
		stateEnteredAt: 999,
	});
});

test("Walking without a stored target collapses to IdleSit (Fix 5)", () => {
	const saved = {
		x: 10,
		y: 20,
		facing: "right" as const,
		currentState: "Walking" as const,
		stateEnteredAt: 42,
	};
	assert.deepEqual(resumeSnapshot(saved, viewport, 999), {
		x: 10,
		y: 20,
		facing: "right",
		currentState: "IdleSit",
		stateEnteredAt: 999,
	});
});

test("Walking with a stored target resumes exactly, toward that target (Fix 5)", () => {
	const saved = {
		x: 10,
		y: 20,
		facing: "right" as const,
		currentState: "Walking" as const,
		stateEnteredAt: 42,
		targetX: 500,
		targetY: 300,
	};
	assert.deepEqual(resumeSnapshot(saved, viewport, 999), saved);

	// A zoomies dash is stored the same way, plus a session end time.
	const dashing = { ...saved, zoomiesEndAt: 12_345 };
	assert.deepEqual(resumeSnapshot(dashing, viewport, 999), dashing);
});

test("ReturningToBase resumes exactly, walking home instead of collapsing (Fix 5)", () => {
	const saved = {
		x: 10,
		y: 20,
		facing: "right" as const,
		currentState: "ReturningToBase" as const,
		stateEnteredAt: 42,
	};
	assert.deepEqual(resumeSnapshot(saved, viewport, 999), saved);
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
	assert.deepEqual({ x: nextEating.x, y: nextEating.y }, eatingSpot(small));
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
