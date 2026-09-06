import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BASE_MARGIN,
	basePosition,
	BED_HEIGHT,
	BED_WIDTH,
	bedPosition,
	PET_SIZE,
} from "./layout.ts";

test("rests inset from the bottom-right corner", () => {
	assert.deepEqual(basePosition({ width: 1000, height: 800 }), {
		x: 1000 - PET_SIZE - BASE_MARGIN,
		y: 800 - PET_SIZE - BASE_MARGIN,
	});
});

test("bed sits centered on the pet's base footprint", () => {
	const view = { width: 1000, height: 800 };
	const base = basePosition(view);
	assert.deepEqual(bedPosition(view), {
		x: base.x + (PET_SIZE - BED_WIDTH) / 2,
		y: base.y + (PET_SIZE - BED_HEIGHT),
	});
});

test("clamps to the viewport when it is smaller than the pet", () => {
	assert.deepEqual(basePosition({ width: 10, height: 10 }), { x: 0, y: 0 });
});
