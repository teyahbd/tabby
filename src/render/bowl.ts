import type { Storage } from "../platform/storage.ts";
import {
	DEFAULT_HUNGER,
	HUNGER_KEY,
	type HungerState,
	isHungerState,
} from "./hungerLoop.ts";
import { bowlPosition } from "./layout.ts";

export const BOWL_ID = "tabby-bowl";

export function mountBowl(
	storage: Storage,
	doc: Document = document,
): () => void {
	if (doc.getElementById(BOWL_ID)) return () => {};

	const bowl = doc.createElement("div");
	bowl.id = BOWL_ID;
	bowl.setAttribute("role", "button");
	bowl.setAttribute("aria-label", "Fill Tabby's food bowl");

	const position = () => {
		const { x, y } = bowlPosition({
			width: doc.documentElement.clientWidth,
			height: doc.documentElement.clientHeight,
		});
		bowl.style.transform = `translate(${x}px, ${y}px)`;
	};

	const reflect = (hunger: HungerState) => {
		bowl.dataset.filled = String(hunger.bowlFilled);
	};

	const onClick = () => {
		void (async () => {
			const current = await storage.get<unknown>(HUNGER_KEY);
			const hunger = isHungerState(current) ? current : DEFAULT_HUNGER;
			if (hunger.bowlFilled) return;
			await storage.set<HungerState>(HUNGER_KEY, {
				...hunger,
				bowlFilled: true,
			});
		})();
	};

	position();
	reflect(DEFAULT_HUNGER);
	bowl.addEventListener("click", onClick);
	doc.body.appendChild(bowl);

	const unsubscribe = storage.subscribe<unknown>(HUNGER_KEY, (value) => {
		reflect(isHungerState(value) ? value : DEFAULT_HUNGER);
	});
	void storage
		.get<unknown>(HUNGER_KEY)
		.then((value) => reflect(isHungerState(value) ? value : DEFAULT_HUNGER));

	const view = doc.defaultView;
	view?.addEventListener("resize", position);

	return () => {
		unsubscribe();
		view?.removeEventListener("resize", position);
		bowl.removeEventListener("click", onClick);
		bowl.remove();
	};
}

export default mountBowl;
