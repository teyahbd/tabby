import { LEADER_KEY } from "../platform/leader.ts";
import { createChromeStorage } from "../platform/storage.ts";
import { mountPet } from "../render/pet.ts";

const storage = createChromeStorage();

let unmount: (() => void) | null = null;
let myTabId: number | null = null;

function apply(leaderTabId: number | null): void {
	const isLeader = myTabId != null && leaderTabId === myTabId;
	if (isLeader && !unmount) {
		unmount = mountPet();
	} else if (!isLeader && unmount) {
		unmount();
		unmount = null;
	}
}

async function init(): Promise<void> {
	const response: { tabId: number | null } | undefined =
		await chrome.runtime.sendMessage({ type: "tabby:whoami" });
	myTabId = response?.tabId ?? null;
	storage.subscribe<number>(LEADER_KEY, apply);
	apply(await storage.get<number>(LEADER_KEY));
}

void init();
