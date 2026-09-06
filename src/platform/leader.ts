export const LEADER_KEY = "leaderTabId";

export type LeaderEvent =
	| { type: "activated"; tabId: number }
	| { type: "focusChanged"; activeTabId: number | null }
	| { type: "removed"; tabId: number; nextActiveTabId: number | null };

export function reduceLeader(
	current: number | null,
	event: LeaderEvent,
): number | null {
	switch (event.type) {
		case "activated":
			return event.tabId;
		case "focusChanged":
			return event.activeTabId ?? current;
		case "removed":
			return event.tabId === current ? event.nextActiveTabId : current;
	}
}
