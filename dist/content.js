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
  function basePosition(viewport, petSize = PET_SIZE) {
    return {
      x: Math.max(0, viewport.width - petSize - BASE_MARGIN),
      y: Math.max(0, viewport.height - petSize - BASE_MARGIN)
    };
  }

  // src/render/pet.ts
  var ROOT_ID = "tabby-root";
  function mountPet(doc = document) {
    if (doc.getElementById(ROOT_ID)) return () => {
    };
    const root = doc.createElement("div");
    root.id = ROOT_ID;
    const sprite = doc.createElement("div");
    sprite.id = "tabby-sprite";
    sprite.setAttribute("role", "img");
    sprite.setAttribute("aria-label", "Tabby");
    root.appendChild(sprite);
    const place = () => {
      const pos = basePosition({
        width: doc.documentElement.clientWidth,
        height: doc.documentElement.clientHeight
      });
      root.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    };
    doc.body.appendChild(root);
    place();
    const view = doc.defaultView;
    view?.addEventListener("resize", place);
    return () => {
      view?.removeEventListener("resize", place);
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
      unmount = mountPet();
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
