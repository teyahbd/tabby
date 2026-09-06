import { createChromeStorage } from "../platform/storage.ts";
import {
	LEADER_KEY,
	reduceLeader,
	type LeaderEvent,
} from "../platform/leader.ts";

const storage = createChromeStorage();

async function dispatch(event: LeaderEvent): Promise<void> {
	const current = await storage.get<number>(LEADER_KEY);
	const next = reduceLeader(current, event);
	if (next !== current) await storage.set(LEADER_KEY, next);
}

async function activeTabId(
	query: chrome.tabs.QueryInfo,
): Promise<number | null> {
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
			activeTabId: await activeTabId({ active: true, windowId }),
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
				lastFocusedWindow: true,
			}),
		});
	})();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message?.type === "tabby:whoami") {
		sendResponse({ tabId: sender.tab?.id ?? null });
	}
	return false;
});

function claimInitialLeader(): void {
	void (async () => {
		const id = await activeTabId({ active: true, lastFocusedWindow: true });
		if (id != null) await storage.set(LEADER_KEY, id);
	})();
}

chrome.runtime.onStartup.addListener(claimInitialLeader);
chrome.runtime.onInstalled.addListener(claimInitialLeader);
