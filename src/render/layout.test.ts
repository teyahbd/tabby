import assert from "node:assert/strict";
import { test } from "node:test";
import {
	BASE_MARGIN,
	basePosition,
	BED_HEIGHT,
	BED_LABEL_BOTTOM_INSET,
	BED_LABEL_LINE_HEIGHT,
	BED_WIDTH,
	bedLabelPosition,
	bedPosition,
	BOWL_GAP,
	BOWL_HEIGHT,
	BOWL_WIDTH,
	eatingSpot,
	bowlPosition,
	PET_SIZE,
} from "./layout.ts";

test("rests inset from the bottom-right corner", () => {
	assert.deepEqual(basePosition({ width: 1000, height: 800 }), {
		x: 1000 - PET_SIZE - BASE_MARGIN,
		y: 800 - PET_SIZE - BASE_MARGIN,
	});
});

test("bed is pinned bottom-right with the same inset as the pet", () => {
	const view = { width: 1000, height: 800 };
	const bed = bedPosition(view);
	assert.deepEqual(bed, {
		x: view.width - BED_WIDTH - BASE_MARGIN,
		y: view.height - BED_HEIGHT - BASE_MARGIN,
	});
	assert.equal(bed.y + BED_HEIGHT, basePosition(view).y + PET_SIZE);
	assert.equal(bed.x, Math.round(bed.x));
	assert.equal(bed.y, Math.round(bed.y));
});

test("name label overlaps the bed near the bottom, clear of the last rows", () => {
	const view = { width: 1000, height: 800 };
	const bed = bedPosition(view);
	const label = bedLabelPosition(view);
	assert.deepEqual(label, {
		x: bed.x,
		y: bed.y + BED_HEIGHT - BED_LABEL_BOTTOM_INSET - BED_LABEL_LINE_HEIGHT,
	});
	assert.ok(label.y + BED_LABEL_LINE_HEIGHT <= bed.y + BED_HEIGHT);
	assert.equal(label.y, Math.round(label.y));
});

test("bowl sits just left of the bed on the same floor", () => {
	const view = { width: 1000, height: 800 };
	const bed = bedPosition(view);
	assert.deepEqual(bowlPosition(view), {
		x: bed.x - BOWL_GAP - BOWL_WIDTH,
		y: basePosition(view).y + (PET_SIZE - BOWL_HEIGHT),
	});
});

test("the eating spot sits left of the bowl on the same floor", () => {
	const view = { width: 1000, height: 800 };
	const bowl = bowlPosition(view);
	assert.deepEqual(eatingSpot(view), {
		x: bowl.x - (BOWL_GAP + PET_SIZE) / 2,
		y: basePosition(view).y,
	});
});

test("clamps to the viewport when it is smaller than the pet", () => {
	assert.deepEqual(basePosition({ width: 10, height: 10 }), { x: 0, y: 0 });
});
