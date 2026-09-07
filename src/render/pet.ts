import type { Storage } from "../platform/storage.ts";
import { mountBed } from "./bed.ts";
import { mountBowl } from "./bowl.ts";
import { startDragInput } from "./dragInput.ts";
import {
	DEFAULT_HUNGER,
	HUNGER_KEY,
	type HungerState,
	isHungerState,
	startHungerLoop,
} from "./hungerLoop.ts";
import { startIdleLoop } from "./idleLoop.ts";
import { startNapLoop } from "./napLoop.ts";
import { startNightLoop } from "./nightLoop.ts";
import { startPetting } from "./petting.ts";
import {
	PET_STATE_KEY,
	repositionOnResize,
	resumeSnapshot,
	type PetSnapshot,
} from "./petState.ts";
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

	const zzz = doc.createElement("div");
	zzz.id = "tabby-zzz";
	zzz.setAttribute("aria-hidden", "true");
	for (let i = 0; i < 3; i++) {
		const z = doc.createElement("span");
		z.textContent = "z";
		z.style.setProperty("--i", String(i));
		zzz.appendChild(z);
	}
	root.appendChild(zzz);

	let snapshot: PetSnapshot | null = null;
	let disposed = false;
	let stopIdle: (() => void) | null = null;
	let stopWalk: (() => void) | null = null;
	let stopNap: (() => void) | null = null;
	let stopNight: (() => void) | null = null;
	let stopDrag: (() => void) | null = null;
	let stopPetting: (() => void) | null = null;
	let stopHunger: (() => void) | null = null;
	let unsubHunger: (() => void) | null = null;
	let hunger: HungerState = DEFAULT_HUNGER;

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

	const onResize = () => {
		if (!snapshot) return;
		const next = repositionOnResize(snapshot, viewport(doc));
		if (next !== snapshot) patchSnapshot({ x: next.x, y: next.y });
	};
	const view = doc.defaultView;
	view?.addEventListener("resize", onResize);

	const unmountBed = mountBed(doc);
	const unmountBowl = mountBowl(storage, doc);

	void (async () => {
		const saved = await storage.get<unknown>(PET_STATE_KEY);
		if (disposed) return;
		const resumed = resumeSnapshot(saved, viewport(doc), Date.now());
		snapshot = resumed;
		render();
		doc.body.appendChild(root);
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

		const savedHunger = await storage.get<unknown>(HUNGER_KEY);
		if (disposed) return;
		hunger = isHungerState(savedHunger) ? savedHunger : DEFAULT_HUNGER;
		unsubHunger = storage.subscribe<unknown>(HUNGER_KEY, (value) => {
			hunger = isHungerState(value) ? value : DEFAULT_HUNGER;
		});

		stopHunger = startHungerLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			getHunger: () => hunger,
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getFacing: () => snapshot?.facing ?? "left",
			getViewport: () => viewport(doc),
			getEnteredAt: () => snapshot?.stateEnteredAt ?? Date.now(),
			onEatStart: ({ facing }) =>
				patchSnapshot({
					currentState: "Eating",
					facing,
					stateEnteredAt: Date.now(),
				}),
			onEatStep: ({ x, y }) => patchSnapshot({ x, y }, false),
			onFinishEating: ({ ateAt, x, y }) => {
				patchSnapshot({
					currentState: "IdleSit",
					x,
					y,
					stateEnteredAt: Date.now(),
				});
				void storage.set<HungerState>(HUNGER_KEY, {
					bowlFilled: false,
					lastAteAt: ateAt,
				});
			},
		});
	})();

	return () => {
		disposed = true;
		view?.removeEventListener("resize", onResize);
		stopIdle?.();
		stopWalk?.();
		stopNap?.();
		stopNight?.();
		stopDrag?.();
		stopPetting?.();
		stopHunger?.();
		unsubHunger?.();
		unmountBed();
		unmountBowl();
		root.remove();
	};
}
