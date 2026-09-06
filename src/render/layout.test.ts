import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BASE_MARGIN,
	basePosition,
	BED_HEIGHT,
	BED_WIDTH,
	bedPosition,
	BOWL_GAP,
	BOWL_SIZE,
	bowlFeedSpot,
	bowlPosition,
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

test("bowl sits just left of the bed on the same floor", () => {
	const view = { width: 1000, height: 800 };
	const bed = bedPosition(view);
	assert.deepEqual(bowlPosition(view), {
		x: bed.x - BOWL_GAP - BOWL_SIZE,
		y: basePosition(view).y + (PET_SIZE - BOWL_SIZE),
	});
});

test("the feed spot centers the pet over the bowl at floor height", () => {
	const view = { width: 1000, height: 800 };
	assert.deepEqual(bowlFeedSpot(view), {
		x: bowlPosition(view).x - (PET_SIZE - BOWL_SIZE) / 2,
		y: basePosition(view).y,
	});
});

test("clamps to the viewport when it is smaller than the pet", () => {
	assert.deepEqual(basePosition({ width: 10, height: 10 }), { x: 0, y: 0 });
});
