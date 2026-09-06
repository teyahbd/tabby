import assert from "node:assert/strict";
import { test } from "node:test";
import { createChromeStorage } from "./storage.ts";

type Change = { oldValue?: unknown; newValue?: unknown };

function fakeArea() {
	const data: Record<string, unknown> = {};
	const listeners = new Set<(changes: Record<string, Change>) => void>();
	return {
		get: async (key: string) =>
			key in data ? { [key]: data[key] } : ({} as Record<string, unknown>),
		set: async (items: Record<string, unknown>) => {
			const changes: Record<string, Change> = {};
			for (const [k, v] of Object.entries(items)) {
				changes[k] = { oldValue: data[k], newValue: v };
				data[k] = v;
			}
			for (const l of listeners) l(changes);
		},
		onChanged: {
			addListener: (l: (changes: Record<string, Change>) => void) =>
				listeners.add(l),
			removeListener: (l: (changes: Record<string, Change>) => void) =>
				listeners.delete(l),
		},
	};
}

test("round-trips a value, missing keys read as null", async () => {
	const store = createChromeStorage(
		fakeArea() as unknown as chrome.storage.StorageArea,
	);
	assert.equal(await store.get("pet"), null);
	await store.set("pet", { state: "IdleSit" });
	assert.deepEqual(await store.get("pet"), { state: "IdleSit" });
});

test("subscribe fires on change until unsubscribed", async () => {
	const store = createChromeStorage(
		fakeArea() as unknown as chrome.storage.StorageArea,
	);
	const seen: unknown[] = [];
	const off = store.subscribe("pet", (v) => seen.push(v));
	await store.set("pet", 1);
	await store.set("pet", 2);
	off();
	await store.set("pet", 3);
	assert.deepEqual(seen, [1, 2]);
});
