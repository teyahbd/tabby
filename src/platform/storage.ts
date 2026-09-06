export interface Storage {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T): Promise<void>;
	subscribe<T>(key: string, onChange: (value: T | null) => void): () => void;
}

export function createChromeStorage(
	area: chrome.storage.StorageArea = chrome.storage.local,
): Storage {
	return {
		async get<T>(key: string) {
			const out = await area.get(key);
			return (out[key] ?? null) as T | null;
		},
		async set<T>(key: string, value: T) {
			await area.set({ [key]: value });
		},
		subscribe<T>(key: string, onChange: (value: T | null) => void) {
			const listener = (changes: {
				[name: string]: chrome.storage.StorageChange;
			}) => {
				if (key in changes) {
					onChange((changes[key].newValue ?? null) as T | null);
				}
			};
			area.onChanged.addListener(listener);
			return () => area.onChanged.removeListener(listener);
		},
	};
}
