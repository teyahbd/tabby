"use strict";
(() => {
  // src/platform/leader.ts
  var LEADER_KEY = "leaderTabId";

  // src/platform/storage.ts
  function createChromeStorage(area = chrome.storage.local) {
    return {
      async get(key) {
        const out = await area.get(key);
        return out[key] ?? null;
      },
      async set(key, value) {
        await area.set({ [key]: value });
      },
      subscribe(key, onChange) {
        const listener = (changes) => {
          if (key in changes) {
            onChange(changes[key].newValue ?? null);
          }
        };
        area.onChanged.addListener(listener);
        return () => area.onChanged.removeListener(listener);
      }
    };
  }

  // src/render/layout.ts
  var PET_SIZE = 48;
  var BASE_MARGIN = 24;
  var BED_WIDTH = 64;
  var BED_HEIGHT = 40;
  function basePosition(viewport2, petSize = PET_SIZE) {
    return {
      x: Math.max(0, viewport2.width - petSize - BASE_MARGIN),
      y: Math.max(0, viewport2.height - petSize - BASE_MARGIN)
    };
  }
  function bedPosition(viewport2) {
    const base = basePosition(viewport2);
    return {
      x: base.x + (PET_SIZE - BED_WIDTH) / 2,
      y: base.y + (PET_SIZE - BED_HEIGHT)
    };
  }

  // src/render/bed.ts
  var BED_ID = "tabby-bed";
  var PET_NAME = "Tabby";
  function mountBed(doc = document) {
    if (doc.getElementById(BED_ID)) return () => {
    };
    const bed = doc.createElement("div");
    bed.id = BED_ID;
    const label = doc.createElement("div");
    label.id = "tabby-bed-label";
    label.textContent = PET_NAME;
    bed.appendChild(label);
    const position = () => {
      const { x, y } = bedPosition({
        width: doc.documentElement.clientWidth,
        height: doc.documentElement.clientHeight
      });
      bed.style.transform = `translate(${x}px, ${y}px)`;
    };
    position();
    doc.body.appendChild(bed);
    const view = doc.defaultView;
    view?.addEventListener("resize", position);
    return () => {
      view?.removeEventListener("resize", position);
      bed.remove();
    };
  }

  // src/render/dragInput.ts
  var DRAG_START_STATES = /* @__PURE__ */ new Set([
    "IdleSit",
    "IdleLie",
    "Walking",
    "Napping",
    "ReturningToBase",
    "AtBase"
  ]);
  var BED_SNAP_RADIUS = PET_SIZE * 1.5;
  var DRAG_THRESHOLD_PX = 4;
  function canGrab(state) {
    return DRAG_START_STATES.has(state);
  }
  function clampToViewport(pos, viewport2, petSize = PET_SIZE) {
    return {
      x: Math.min(Math.max(0, pos.x), Math.max(0, viewport2.width - petSize)),
      y: Math.min(Math.max(0, pos.y), Math.max(0, viewport2.height - petSize))
    };
  }
  function dropState(pos, viewport2, radius = BED_SNAP_RADIUS) {
    const base = basePosition(viewport2);
    return Math.hypot(pos.x - base.x, pos.y - base.y) <= radius ? "AtBase" : "IdleSit";
  }
  function startDragInput(deps) {
    const moveTarget = deps.moveTarget ?? deps.sprite;
    let pointerStart = null;
    let petStart = { x: 0, y: 0 };
    let grabbed = false;
    const currentPos = (event) => {
      const viewport2 = deps.getViewport();
      return clampToViewport(
        {
          x: petStart.x + (event.clientX - (pointerStart?.x ?? 0)),
          y: petStart.y + (event.clientY - (pointerStart?.y ?? 0))
        },
        viewport2
      );
    };
    const onMove = (event) => {
      const e = event;
      if (!pointerStart) return;
      if (!grabbed) {
        const moved = Math.hypot(
          e.clientX - pointerStart.x,
          e.clientY - pointerStart.y
        );
        if (moved <= DRAG_THRESHOLD_PX) return;
        grabbed = true;
        deps.onGrab();
      }
      deps.onDrag(currentPos(e));
    };
    const onUp = (event) => {
      const e = event;
      if (!pointerStart) return;
      const wasGrabbed = grabbed;
      const pos = currentPos(e);
      pointerStart = null;
      grabbed = false;
      moveTarget.removeEventListener("pointermove", onMove);
      moveTarget.removeEventListener("pointerup", onUp);
      moveTarget.removeEventListener("pointercancel", onUp);
      if (!wasGrabbed) return;
      deps.onDrop({
        currentState: dropState(pos, deps.getViewport()),
        x: pos.x,
        y: pos.y
      });
    };
    const onDown = (event) => {
      const e = event;
      if (e.isPrimary === false || e.button > 0) return;
      if (pointerStart || !canGrab(deps.getState())) return;
      e.preventDefault?.();
      pointerStart = { x: e.clientX, y: e.clientY };
      petStart = deps.getPosition();
      grabbed = false;
      moveTarget.addEventListener("pointermove", onMove);
      moveTarget.addEventListener("pointerup", onUp);
      moveTarget.addEventListener("pointercancel", onUp);
    };
    deps.sprite.addEventListener("pointerdown", onDown);
    return () => {
      deps.sprite.removeEventListener("pointerdown", onDown);
      moveTarget.removeEventListener("pointermove", onMove);
      moveTarget.removeEventListener("pointerup", onUp);
      moveTarget.removeEventListener("pointercancel", onUp);
      pointerStart = null;
      grabbed = false;
    };
  }

  // src/render/idleLoop.ts
  var IDLE_MIN_MS = 3e4;
  var IDLE_MAX_MS = 9e4;
  var IDLE_POSES = /* @__PURE__ */ new Set([
    "IdleSit",
    "IdleLie"
  ]);
  function isIdlePose(state) {
    return IDLE_POSES.has(state);
  }
  function idleDelayMs(rng = Math.random) {
    return IDLE_MIN_MS + Math.floor(rng() * (IDLE_MAX_MS - IDLE_MIN_MS));
  }
  function nextIdlePose(current, rng = Math.random) {
    return {
      currentState: current === "IdleSit" ? "IdleLie" : "IdleSit",
      facing: rng() < 0.5 ? "left" : "right"
    };
  }
  function startIdleLoop(deps) {
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((handle2) => clearTimeout(handle2));
    const rng = deps.rng ?? Math.random;
    let handle = null;
    const arm = () => {
      handle = setTimer(() => {
        if (isIdlePose(deps.getState())) {
          deps.onFlip(nextIdlePose(deps.getState(), rng));
        }
        arm();
      }, idleDelayMs(rng));
    };
    arm();
    return () => {
      if (handle != null) clearTimer(handle);
      handle = null;
    };
  }

  // src/render/napLoop.ts
  var NAP_CHECK_MIN_MS = 6e4;
  var NAP_CHECK_MAX_MS = 12e4;
  var NAP_CHANCE = 0.08;
  var NAP_MIN_MS = 5 * 6e4;
  var NAP_MAX_MS = 10 * 6e4;
  var NAP_START_STATES = /* @__PURE__ */ new Set([
    "IdleSit",
    "IdleLie",
    "AtBase"
  ]);
  function napCheckDelayMs(rng = Math.random) {
    return NAP_CHECK_MIN_MS + Math.floor(rng() * (NAP_CHECK_MAX_MS - NAP_CHECK_MIN_MS));
  }
  function napDurationMs(rng = Math.random) {
    return NAP_MIN_MS + Math.floor(rng() * (NAP_MAX_MS - NAP_MIN_MS));
  }
  function isDaytime(date = /* @__PURE__ */ new Date()) {
    const hour = date.getHours();
    return hour >= 7 && hour < 22;
  }
  function shouldNap(state, daytime, rng = Math.random) {
    return daytime && NAP_START_STATES.has(state) && rng() < NAP_CHANCE;
  }
  function startNapLoop(deps) {
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((handle2) => clearTimeout(handle2));
    const now = deps.now ?? (() => /* @__PURE__ */ new Date());
    const rng = deps.rng ?? Math.random;
    let handle = null;
    const armCheck = () => {
      handle = setTimer(check, napCheckDelayMs(rng));
    };
    const check = () => {
      handle = null;
      if (shouldNap(deps.getState(), isDaytime(now()), rng)) {
        deps.onNap();
        handle = setTimer(wake, napDurationMs(rng));
        return;
      }
      armCheck();
    };
    const wake = () => {
      handle = null;
      if (deps.getState() === "Napping") deps.onWake();
      armCheck();
    };
    armCheck();
    return () => {
      if (handle != null) clearTimer(handle);
      handle = null;
    };
  }

  // src/render/walkLoop.ts
  var WANDER_MIN_MS = 3e3;
  var WANDER_MAX_MS = 6e3;
  var WALK_SPEED_PX_PER_S = 90;
  var WANDER_MARGIN = 24;
  function wanderDelayMs(rng = Math.random) {
    return WANDER_MIN_MS + Math.floor(rng() * (WANDER_MAX_MS - WANDER_MIN_MS));
  }
  function pickDestination(viewport2, rng = Math.random, petSize = PET_SIZE) {
    const spanX = Math.max(0, viewport2.width - petSize - 2 * WANDER_MARGIN);
    const spanY = Math.max(0, viewport2.height - petSize - 2 * WANDER_MARGIN);
    return {
      x: WANDER_MARGIN + Math.round(rng() * spanX),
      y: WANDER_MARGIN + Math.round(rng() * spanY)
    };
  }
  function walkStep(from, to, dtMs, speed = WALK_SPEED_PX_PER_S) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const travel = speed * Math.max(0, dtMs) / 1e3;
    if (dist === 0 || travel >= dist) return { x: to.x, y: to.y, arrived: true };
    return {
      x: from.x + dx / dist * travel,
      y: from.y + dy / dist * travel,
      arrived: false
    };
  }
  function facingFor(fromX, toX, current) {
    if (toX < fromX) return "left";
    if (toX > fromX) return "right";
    return current;
  }
  function arrivalPose(rng = Math.random) {
    return rng() < 0.5 ? "IdleSit" : "IdleLie";
  }
  function startWalkLoop(deps) {
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
    const raf = deps.raf ?? ((fn) => requestAnimationFrame(fn));
    const cancelRaf = deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
    const now = deps.now ?? (() => performance.now());
    const rng = deps.rng ?? Math.random;
    let timerHandle = null;
    let rafHandle = null;
    const arm = () => {
      timerHandle = setTimer(depart, wanderDelayMs(rng));
    };
    const depart = () => {
      timerHandle = null;
      if (!isIdlePose(deps.getState())) {
        arm();
        return;
      }
      const start = deps.getPosition();
      const dest = pickDestination(deps.getViewport(), rng);
      deps.onDepart({ facing: facingFor(start.x, dest.x, deps.getFacing()) });
      let last = now();
      const frame = (t) => {
        if (deps.getState() !== "Walking") {
          rafHandle = null;
          arm();
          return;
        }
        const step = walkStep(deps.getPosition(), dest, t - last);
        last = t;
        if (step.arrived) {
          rafHandle = null;
          deps.onArrive({
            currentState: arrivalPose(rng),
            x: dest.x,
            y: dest.y
          });
          arm();
          return;
        }
        deps.onStep({ x: step.x, y: step.y });
        rafHandle = raf(frame);
      };
      rafHandle = raf(frame);
    };
    arm();
    return () => {
      if (timerHandle != null) clearTimer(timerHandle);
      if (rafHandle != null) cancelRaf(rafHandle);
      timerHandle = null;
      rafHandle = null;
    };
  }

  // src/render/nightLoop.ts
  var NIGHT_CHECK_MS = 3e4;
  var RETURN_START_STATES = /* @__PURE__ */ new Set([
    "IdleSit",
    "IdleLie",
    "Walking",
    "Napping"
  ]);
  function isNight(date = /* @__PURE__ */ new Date()) {
    return !isDaytime(date);
  }
  function startNightLoop(deps) {
    const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
    const raf = deps.raf ?? ((fn) => requestAnimationFrame(fn));
    const cancelRaf = deps.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
    const now = deps.now ?? (() => performance.now());
    const nowDate = deps.nowDate ?? (() => /* @__PURE__ */ new Date());
    let timerHandle = null;
    let rafHandle = null;
    const arm = () => {
      timerHandle = setTimer(check, NIGHT_CHECK_MS);
    };
    const startReturn = () => {
      const base = basePosition(deps.getViewport());
      deps.onReturnDepart({
        facing: facingFor(deps.getPosition().x, base.x, deps.getFacing())
      });
      let last = now();
      const frame = (t) => {
        if (deps.getState() !== "ReturningToBase") {
          rafHandle = null;
          arm();
          return;
        }
        const step = walkStep(deps.getPosition(), base, t - last);
        last = t;
        if (step.arrived) {
          rafHandle = null;
          deps.onSleep({ x: base.x, y: base.y });
          arm();
          return;
        }
        deps.onReturnStep({ x: step.x, y: step.y });
        rafHandle = raf(frame);
      };
      rafHandle = raf(frame);
    };
    const check = () => {
      timerHandle = null;
      const state = deps.getState();
      if (!isNight(nowDate())) {
        if (state === "Sleeping") deps.onWake();
        arm();
        return;
      }
      if (state === "AtBase") {
        deps.onSleep(deps.getPosition());
      } else if (RETURN_START_STATES.has(state)) {
        startReturn();
        return;
      }
      arm();
    };
    check();
    return () => {
      if (timerHandle != null) clearTimer(timerHandle);
      if (rafHandle != null) cancelRaf(rafHandle);
      timerHandle = null;
      rafHandle = null;
    };
  }

  // src/render/petState.ts
  var PET_STATE_KEY = "petState";
  var STABLE_STATES = /* @__PURE__ */ new Set([
    "IdleSit",
    "IdleLie",
    "Napping",
    "AtBase",
    "Sleeping"
  ]);
  function isStable(state) {
    return STABLE_STATES.has(state);
  }
  function initialSnapshot(viewport2, now = Date.now()) {
    const pos = basePosition(viewport2);
    return {
      x: pos.x,
      y: pos.y,
      facing: "left",
      currentState: "IdleSit",
      stateEnteredAt: now
    };
  }
  function isPetSnapshot(value) {
    if (typeof value !== "object" || value === null) return false;
    const v = value;
    return typeof v.x === "number" && typeof v.y === "number" && (v.facing === "left" || v.facing === "right") && typeof v.currentState === "string" && typeof v.stateEnteredAt === "number";
  }
  function resumeSnapshot(saved, viewport2, now = Date.now()) {
    if (!isPetSnapshot(saved)) return initialSnapshot(viewport2, now);
    if (isStable(saved.currentState)) return saved;
    return { ...saved, currentState: "IdleSit", stateEnteredAt: now };
  }

  // src/render/pet.ts
  var ROOT_ID = "tabby-root";
  function viewport(doc) {
    return {
      width: doc.documentElement.clientWidth,
      height: doc.documentElement.clientHeight
    };
  }
  function mountPet(storage2, doc = document) {
    if (doc.getElementById(ROOT_ID)) return () => {
    };
    const root = doc.createElement("div");
    root.id = ROOT_ID;
    const sprite = doc.createElement("div");
    sprite.id = "tabby-sprite";
    sprite.setAttribute("role", "img");
    sprite.setAttribute("aria-label", "Tabby");
    root.appendChild(sprite);
    let snapshot = null;
    let disposed = false;
    let stopIdle = null;
    let stopWalk = null;
    let stopNap = null;
    let stopNight = null;
    let stopDrag = null;
    const render = () => {
      if (!snapshot) return;
      root.style.transform = `translate(${snapshot.x}px, ${snapshot.y}px)`;
      root.dataset.state = snapshot.currentState;
      root.dataset.facing = snapshot.facing;
    };
    const patchSnapshot = (patch, persist = true) => {
      if (!snapshot) return;
      snapshot = { ...snapshot, ...patch };
      render();
      if (persist) void storage2.set(PET_STATE_KEY, snapshot);
    };
    const unmountBed = mountBed(doc);
    doc.body.appendChild(root);
    void (async () => {
      const saved = await storage2.get(PET_STATE_KEY);
      if (disposed) return;
      const resumed = resumeSnapshot(saved, viewport(doc), Date.now());
      snapshot = resumed;
      render();
      if (JSON.stringify(saved) !== JSON.stringify(resumed)) {
        await storage2.set(PET_STATE_KEY, resumed);
      }
      stopIdle = startIdleLoop({
        getState: () => snapshot?.currentState ?? "IdleSit",
        onFlip: ({ currentState, facing }) => patchSnapshot({ currentState, facing, stateEnteredAt: Date.now() })
      });
      stopWalk = startWalkLoop({
        getState: () => snapshot?.currentState ?? "IdleSit",
        getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
        getFacing: () => snapshot?.facing ?? "left",
        getViewport: () => viewport(doc),
        onDepart: ({ facing }) => patchSnapshot({
          currentState: "Walking",
          facing,
          stateEnteredAt: Date.now()
        }),
        onStep: ({ x, y }) => patchSnapshot({ x, y }, false),
        onArrive: ({ currentState, x, y }) => patchSnapshot({ currentState, x, y, stateEnteredAt: Date.now() })
      });
      stopNap = startNapLoop({
        getState: () => snapshot?.currentState ?? "IdleSit",
        onNap: () => patchSnapshot({
          currentState: "Napping",
          stateEnteredAt: Date.now()
        }),
        onWake: () => patchSnapshot({
          currentState: "IdleSit",
          stateEnteredAt: Date.now()
        })
      });
      stopNight = startNightLoop({
        getState: () => snapshot?.currentState ?? "IdleSit",
        getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
        getFacing: () => snapshot?.facing ?? "left",
        getViewport: () => viewport(doc),
        onReturnDepart: ({ facing }) => patchSnapshot({
          currentState: "ReturningToBase",
          facing,
          stateEnteredAt: Date.now()
        }),
        onReturnStep: ({ x, y }) => patchSnapshot({ x, y }, false),
        onSleep: ({ x, y }) => patchSnapshot({
          currentState: "Sleeping",
          x,
          y,
          stateEnteredAt: Date.now()
        }),
        onWake: () => patchSnapshot({
          currentState: "IdleSit",
          stateEnteredAt: Date.now()
        })
      });
      stopDrag = startDragInput({
        sprite,
        moveTarget: doc,
        getState: () => snapshot?.currentState ?? "IdleSit",
        getPosition: () => ({ x: snapshot?.x ?? 0, y: snapshot?.y ?? 0 }),
        getViewport: () => viewport(doc),
        onGrab: () => patchSnapshot({
          currentState: "Dragged",
          stateEnteredAt: Date.now()
        }),
        onDrag: ({ x, y }) => patchSnapshot({ x, y }, false),
        onDrop: ({ currentState, x, y }) => patchSnapshot({ currentState, x, y, stateEnteredAt: Date.now() })
      });
    })();
    return () => {
      disposed = true;
      stopIdle?.();
      stopWalk?.();
      stopNap?.();
      stopNight?.();
      stopDrag?.();
      unmountBed();
      root.remove();
    };
  }

  // src/content/index.ts
  var storage = createChromeStorage();
  var unmount = null;
  var myTabId = null;
  function apply(leaderTabId) {
    const isLeader = myTabId != null && leaderTabId === myTabId;
    if (isLeader && !unmount) {
      unmount = mountPet(storage);
    } else if (!isLeader && unmount) {
      unmount();
      unmount = null;
    }
  }
  async function init() {
    const response = await chrome.runtime.sendMessage({ type: "tabby:whoami" });
    myTabId = response?.tabId ?? null;
    storage.subscribe(LEADER_KEY, apply);
    apply(await storage.get(LEADER_KEY));
  }
  void init();
})();
