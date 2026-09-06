import assert from "node:assert/strict";
import { test } from "node:test";
import { reduceLeader } from "./leader.ts";

test("activating a tab makes it the leader", () => {
	assert.equal(reduceLeader(1, { type: "activated", tabId: 2 }), 2);
});

test("focusing a window follows its active tab", () => {
	assert.equal(reduceLeader(1, { type: "focusChanged", activeTabId: 3 }), 3);
});

test("losing all window focus keeps the current leader", () => {
	assert.equal(reduceLeader(5, { type: "focusChanged", activeTabId: null }), 5);
});

test("closing the leader tab reassigns to the next active tab", () => {
	assert.equal(
		reduceLeader(5, { type: "removed", tabId: 5, nextActiveTabId: 6 }),
		6,
	);
});

test("closing a non-leader tab leaves the leader untouched", () => {
	assert.equal(
		reduceLeader(5, { type: "removed", tabId: 9, nextActiveTabId: 6 }),
		5,
	);
});
