import assert from "node:assert/strict";
import { test } from "node:test";
import { NIGHT_VISIT_DURATION_MS, isNightVisiting } from "./nightVisit.ts";

test("isNightVisiting is true only strictly before the expiry timestamp", () => {
	const now = 1_000_000;
	assert.equal(isNightVisiting(null, now), false);
	assert.equal(isNightVisiting(now + 1, now), true);
	assert.equal(isNightVisiting(now, now), false);
	assert.equal(isNightVisiting(now - 1, now), false);
});

test("NIGHT_VISIT_DURATION_MS is 60 minutes", () => {
	assert.equal(NIGHT_VISIT_DURATION_MS, 60 * 60 * 1_000);
});
