import type { Storage } from "../platform/storage.ts";
import { mountBed } from "./bed.ts";
import { mountBowl } from "./bowl.ts";
import { startDragInput } from "./dragInput.ts";
import {
	NIGHT_VISIT_DURATION_MS,
	NIGHT_VISIT_KEY,
	isNightVisiting,
} from "./nightVisit.ts";
import {
	catchUpAwayMeal,
	DEFAULT_HUNGER,
	HUNGER_KEY,
	type HungerState,
	normalizeHunger,
	startHungerLoop,
} from "./hungerLoop.ts";
import { startIdleLoop } from "./idleLoop.ts";
import { basePosition } from "./layout.ts";
import { mountLaser } from "./laser.ts";
import { startLaserLoop } from "./laserLoop.ts";
import { startNapLoop } from "./napLoop.ts";
import { startNightLoop } from "./nightLoop.ts";
import { startPetting } from "./petting.ts";
import {
	PET_STATE_KEY,
	repositionOnResize,
	resolveWalkResume,
	resolveZoomiesResume,
	resumeSnapshot,
	type PetSnapshot,
} from "./petState.ts";
import { reactToPet, spawnCrumbs } from "./reaction.ts";
import { startWalkLoop } from "./walkLoop.ts";
import { startZoomiesLoop } from "./zoomiesLoop.ts";

const ROOT_ID = "tabby-root";
const CRUMB_INTERVAL_MS = 1_200;

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
	let stopZoomies: (() => void) | null = null;
	let stopLaserLoop: (() => void) | null = null;
	let stopNap: (() => void) | null = null;
	let stopNight: (() => void) | null = null;
	let stopDrag: (() => void) | null = null;
	let stopPetting: (() => void) | null = null;
	let stopHunger: (() => void) | null = null;
	let unsubHunger: (() => void) | null = null;
	let hunger: HungerState = DEFAULT_HUNGER;
	let nightVisitUntil: number | null = null;
	let crumbTimer: ReturnType<typeof setInterval> | null = null;

	const startCrumbs = () => {
		if (crumbTimer !== null) return;
		spawnCrumbs(root, doc);
		crumbTimer = setInterval(() => spawnCrumbs(root, doc), CRUMB_INTERVAL_MS);
	};
	const stopCrumbs = () => {
		if (crumbTimer === null) return;
		clearInterval(crumbTimer);
		crumbTimer = null;
	};

	const render = () => {
		if (!snapshot) return;
		root.style.transform = `translate(${snapshot.x}px, ${snapshot.y}px)`;
		root.dataset.state = snapshot.currentState;
		root.dataset.facing = snapshot.facing;
	};

	const setApproachingBowl = (value: boolean) => {
		root.dataset.approaching = value ? "true" : "false";
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
	const laser = mountLaser(doc);

	void (async () => {
		const saved = await storage.get<unknown>(PET_STATE_KEY);
		if (disposed) return;
		const resumed = resumeSnapshot(saved, viewport(doc), Date.now());
		snapshot = resumed;
		render();
		if (resumed.currentState === "Eating") setApproachingBowl(true);
		doc.body.appendChild(root);
		if (JSON.stringify(saved) !== JSON.stringify(resumed)) {
			await storage.set(PET_STATE_KEY, resumed);
		}

		nightVisitUntil = await storage.get<number | null>(NIGHT_VISIT_KEY);
		if (disposed) return;

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
			getResumeTarget: () => resolveWalkResume(snapshot),
			onDepart: ({ facing, targetX, targetY }) =>
				patchSnapshot({
					currentState: "Walking",
					facing,
					targetX,
					targetY,
					zoomiesEndAt: undefined,
					stateEnteredAt: Date.now(),
				}),
			onStep: ({ x, y }) => patchSnapshot({ x, y }, false),
			onArrive: ({ currentState, x, y }) =>
				patchSnapshot({ currentState, x, y, stateEnteredAt: Date.now() }),
		});

		stopZoomies = startZoomiesLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getFacing: () => snapshot?.facing ?? "left",
			getViewport: () => viewport(doc),
			getResumeZoomies: () => resolveZoomiesResume(snapshot),
			onZoomiesStart: ({ endAt }) =>
				patchSnapshot({ zoomiesEndAt: endAt }, false),
			onDepart: ({ facing, targetX, targetY }) =>
				patchSnapshot({
					currentState: "Walking",
					facing,
					targetX,
					targetY,
					stateEnteredAt: Date.now(),
				}),
			onStep: ({ x, y }) => patchSnapshot({ x, y }, false),
			onArrive: ({ currentState, x, y }) =>
				patchSnapshot({
					currentState,
					x,
					y,
					zoomiesEndAt: undefined,
					stateEnteredAt: Date.now(),
				}),
			isNightVisiting: () => isNightVisiting(nightVisitUntil, Date.now()),
			isLaserActive: () => laser.getIsActive(),
		});

		stopLaserLoop = startLaserLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getFacing: () => snapshot?.facing ?? "left",
			getViewport: () => viewport(doc),
			isLaserActive: () => laser.getIsActive(),
			getCursor: () => laser.getCursor(),
			onDepart: ({ facing }) =>
				patchSnapshot({
					currentState: "Walking",
					facing,
					targetX: undefined,
					targetY: undefined,
					zoomiesEndAt: undefined,
					stateEnteredAt: Date.now(),
				}),
			onStep: ({ x, y, facing }) => patchSnapshot({ x, y, facing }, false),
			onDropChase: ({ currentState, x, y }) =>
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
			isNightVisiting: () => isNightVisiting(nightVisitUntil, Date.now()),
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
			isNightVisiting: () => isNightVisiting(nightVisitUntil, Date.now()),
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
			onWakeForNightVisit: () => {
				const base = basePosition(viewport(doc));
				patchSnapshot({
					currentState: "IdleSit",
					x: base.x,
					y: base.y,
					stateEnteredAt: Date.now(),
				});
				nightVisitUntil = Date.now() + NIGHT_VISIT_DURATION_MS;
				void storage.set<number>(NIGHT_VISIT_KEY, nightVisitUntil);
			},
		});

		const savedHunger = await storage.get<unknown>(HUNGER_KEY);
		if (disposed) return;
		hunger = normalizeHunger(savedHunger);

		const awayMeal =
			snapshot.currentState === "Eating"
				? null
				: catchUpAwayMeal(hunger, Date.now());
		if (awayMeal) {
			hunger = awayMeal;
			await storage.set<HungerState>(HUNGER_KEY, awayMeal);
			if (
				snapshot.currentState !== "Sleeping" &&
				snapshot.currentState !== "Napping"
			) {
				reactToPet(root, doc);
			}
		}

		unsubHunger = storage.subscribe<unknown>(HUNGER_KEY, (value) => {
			hunger = normalizeHunger(value);
		});

		stopHunger = startHungerLoop({
			getState: () => snapshot?.currentState ?? "IdleSit",
			getHunger: () => hunger,
			getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
			getFacing: () => snapshot?.facing ?? "left",
			getViewport: () => viewport(doc),
			getEnteredAt: () => snapshot?.stateEnteredAt ?? Date.now(),
			onEatStart: ({ facing }) => {
				setApproachingBowl(true);
				patchSnapshot({
					currentState: "Eating",
					facing,
					stateEnteredAt: Date.now(),
				});
			},
			onEatStep: ({ x, y }) => patchSnapshot({ x, y }, false),
			onEatArrive: ({ x, y, facing }) => {
				setApproachingBowl(false);
				patchSnapshot({ x, y, facing });
				startCrumbs();
			},
			onSeen: (t) => {
				hunger = { ...hunger, lastSeenAt: t };
				void storage.set<HungerState>(HUNGER_KEY, hunger);
			},
			onFinishEating: ({ ateAt, x, y }) => {
				setApproachingBowl(false);
				stopCrumbs();
				patchSnapshot({
					currentState: "IdleSit",
					x,
					y,
					stateEnteredAt: Date.now(),
				});
				hunger = {
					...hunger,
					bowlFilled: false,
					bowlFilledAt: null,
					lastAteAt: ateAt,
				};
				void storage.set<HungerState>(HUNGER_KEY, hunger);
			},
		});
	})();

	return () => {
		disposed = true;
		stopCrumbs();
		view?.removeEventListener("resize", onResize);
		stopIdle?.();
		stopWalk?.();
		stopZoomies?.();
		stopLaserLoop?.();
		stopNap?.();
		stopNight?.();
		stopDrag?.();
		stopPetting?.();
		stopHunger?.();
		unsubHunger?.();
		unmountBed();
		unmountBowl();
		laser.unmount();
		root.remove();
	};
}
