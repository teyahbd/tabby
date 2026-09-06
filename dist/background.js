"use strict";
(() => {
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

  // src/platform/leader.ts
  var LEADER_KEY = "leaderTabId";
  function reduceLeader(current, event) {
    switch (event.type) {
      case "activated":
        return event.tabId;
      case "focusChanged":
        return event.activeTabId ?? current;
      case "removed":
        return event.tabId === current ? event.nextActiveTabId : current;
    }
  }

  // src/background/index.ts
  var storage = createChromeStorage();
  async function dispatch(event) {
    const current = await storage.get(LEADER_KEY);
    const next = reduceLeader(current, event);
    if (next !== current) await storage.set(LEADER_KEY, next);
  }
  async function activeTabId(query) {
    const [tab] = await chrome.tabs.query(query);
    return tab?.id ?? null;
  }
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void dispatch({ type: "activated", tabId });
  });
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    void (async () => {
      await dispatch({
        type: "focusChanged",
        activeTabId: await activeTabId({ active: true, windowId })
      });
    })();
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      await dispatch({
        type: "removed",
        tabId,
        nextActiveTabId: await activeTabId({
          active: true,
          lastFocusedWindow: true
        })
      });
    })();
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "tabby:whoami") {
      sendResponse({ tabId: sender.tab?.id ?? null });
    }
    return false;
  });
  function claimInitialLeader() {
    void (async () => {
      const id = await activeTabId({ active: true, lastFocusedWindow: true });
      if (id != null) await storage.set(LEADER_KEY, id);
    })();
  }
  chrome.runtime.onStartup.addListener(claimInitialLeader);
  chrome.runtime.onInstalled.addListener(claimInitialLeader);
})();
