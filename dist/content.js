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

  // src/render/layout.ts
  var PET_SIZE = 48;
  var BASE_MARGIN = 24;
  function basePosition(viewport2, petSize = PET_SIZE) {
    return {
      x: Math.max(0, viewport2.width - petSize - BASE_MARGIN),
      y: Math.max(0, viewport2.height - petSize - BASE_MARGIN)
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
    const render = () => {
      if (!snapshot) return;
      root.style.transform = `translate(${snapshot.x}px, ${snapshot.y}px)`;
      root.dataset.state = snapshot.currentState;
      root.dataset.facing = snapshot.facing;
    };
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
        onFlip: ({ currentState, facing }) => {
          if (!snapshot) return;
          snapshot = {
            ...snapshot,
            currentState,
            facing,
            stateEnteredAt: Date.now()
          };
          render();
          void storage2.set(PET_STATE_KEY, snapshot);
        }
      });
    })();
    return () => {
      disposed = true;
      stopIdle?.();
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
