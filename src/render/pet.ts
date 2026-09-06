import { basePosition, type Point } from "./layout.ts";

const ROOT_ID = "tabby-root";

export function mountPet(doc: Document = document): () => void {
	if (doc.getElementById(ROOT_ID)) return () => {};

	const root = doc.createElement("div");
	root.id = ROOT_ID;

	const sprite = doc.createElement("div");
	sprite.id = "tabby-sprite";
	sprite.setAttribute("role", "img");
	sprite.setAttribute("aria-label", "Tabby");
	root.appendChild(sprite);

	const place = () => {
		const pos: Point = basePosition({
			width: doc.documentElement.clientWidth,
			height: doc.documentElement.clientHeight,
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
