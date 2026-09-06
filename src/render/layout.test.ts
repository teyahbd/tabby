import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_MARGIN, basePosition, PET_SIZE } from "./layout.ts";

test("rests inset from the bottom-right corner", () => {
	assert.deepEqual(basePosition({ width: 1000, height: 800 }), {
		x: 1000 - PET_SIZE - BASE_MARGIN,
		y: 800 - PET_SIZE - BASE_MARGIN,
	});
});

test("clamps to the viewport when it is smaller than the pet", () => {
	assert.deepEqual(basePosition({ width: 10, height: 10 }), { x: 0, y: 0 });
});
