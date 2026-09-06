import type { Storage } from "../platform/storage.ts";
import { mountBed } from "./bed.ts";
import { startDragInput } from "./dragInput.ts";
import { startIdleLoop } from "./idleLoop.ts";
import { startNapLoop } from "./napLoop.ts";
import { startNightLoop } from "./nightLoop.ts";
import { startPetting } from "./petting.ts";
import { PET_STATE_KEY, resumeSnapshot, type PetSnapshot } from "./petState.ts";
import { reactToPet } from "./reaction.ts";
import { startWalkLoop } from "./walkLoop.ts";

const ROOT_ID = "tabby-root";

function viewport(doc: Document) {
	return {
		width: doc.documentElement.clientWidth,
		height: doc.documentElement.clientHeight,
	};
}

export function mountPet(
	storage: Storage,
	doc: Document = document,
): () => void {
	if (doc.getElementById(ROOT_ID)) return () => {};

	const root = doc.createElement("div");
	root.id = ROOT_ID;

	const sprite = doc.createElement("div");
	sprite.id = "tabby-sprite";
	sprite.setAttribute("role", "img");
	sprite.setAttribute("aria-label", "Tabby");
	root.appendChild(sprite);

	let snapshot: PetSnapshot | null = null;
	let disposed = false;
	let stopIdle: (() => void) | null = null;
	let stopWalk: (() => void) | null = null;
	let stopNap: (() => void) | null = null;
	let stopNight: (() => void) | null = null;
	let stopDrag: (() => void) | null = null;
	let stopPetting: (() => void) | null = null;

	const render = () => {
		if (!snapshot) return;
		root.style.transform = `translate(${snapshot.x}px, ${snapshot.y}px)`;
		root.dataset.state = snapshot.currentState;
		root.dataset.facing = snapshot.facing;
	};

	const patchSnapshot = (patch: Partial<PetSnapshot>, persist = true) => {
		if (!snapshot) return;
		snapshot = { ...snapshot, ...patch };
		render();
		if (persist) void storage.set(PET_STATE_KEY, snapshot);
	};

	const unmountBed = mountBed(doc);
	doc.body.appendChild(root);

	void (async () => {
		const saved = await storage.get<unknown>(PET_STATE_KEY);
		if (disposed) return;
		const resumed = resumeSnapshot(saved, viewport(doc), Date.now());
		snapshot = resumed;
		render();
		if (JSON.stringify(saved) !== JSON.stringify(resumed)) {
			await storage.set(PET_STATE_KEY, resumed);
		}

		stopIdle = startIdleLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			onFlip: ({ currentState, facing }) =>
				patchSnapshot({ currentState, facing, stateEnteredAt: Date.now() }),
		});

		stopWalk = startWalkLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getFacing: () => snapshot?.facing ?? "left",
			getViewport: () => viewport(doc),
			onDepart: ({ facing }) =>
				patchSnapshot({
					currentState: "Walking",
					facing,
					stateEnteredAt: Date.now(),
				}),
			onStep: ({ x, y }) => patchSnapshot({ x, y }, false),
			onArrive: ({ currentState, x, y }) =>
				patchSnapshot({ currentState, x, y, stateEnteredAt: Date.now() }),
		});

		stopNap = startNapLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			onNap: () =>
				patchSnapshot({
					currentState: "Napping",
					stateEnteredAt: Date.now(),
				}),
			onWake: () =>
				patchSnapshot({
					currentState: "IdleSit",
					stateEnteredAt: Date.now(),
				}),
		});

		stopNight = startNightLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getFacing: () => snapshot?.facing ?? "left",
			getViewport: () => viewport(doc),
			onReturnDepart: ({ facing }) =>
				patchSnapshot({
					currentState: "ReturningToBase",
					facing,
					stateEnteredAt: Date.now(),
				}),
			onReturnStep: ({ x, y }) => patchSnapshot({ x, y }, false),
			onSleep: ({ x, y }) =>
				patchSnapshot({
					currentState: "Sleeping",
					x,
					y,
					stateEnteredAt: Date.now(),
				}),
			onWake: () =>
				patchSnapshot({
					currentState: "IdleSit",
					stateEnteredAt: Date.now(),
				}),
		});

		stopDrag = startDragInput({
			sprite,
			moveTarget: doc,
			getState: () => snapshot?.currentState ?? "IdleSit",
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getViewport: () => viewport(doc),
			onGrab: () =>
				patchSnapshot({
					currentState: "Dragged",
					stateEnteredAt: Date.now(),
				}),
			onDrag: ({ x, y }) => patchSnapshot({ x, y }, false),
			onDrop: ({ currentState, x, y }) =>
				patchSnapshot({ currentState, x, y, stateEnteredAt: Date.now() }),
		});

		stopPetting = startPetting({
			sprite,
			getState: () => snapshot?.currentState ?? "IdleSit",
			onPet: () => reactToPet(root, doc),
		});
	})();

	return () => {
		disposed = true;
		stopIdle?.();
		stopWalk?.();
		stopNap?.();
		stopNight?.();
		stopDrag?.();
		stopPetting?.();
		unmountBed();
		root.remove();
	};
}
