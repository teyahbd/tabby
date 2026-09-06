import { bedPosition } from "./layout.ts";

export const BED_ID = "tabby-bed";
export const PET_NAME = "Tabby";

export function mountBed(doc: Document = document): () => void {
	if (doc.getElementById(BED_ID)) return () => {};

	const bed = doc.createElement("div");
	bed.id = BED_ID;

	const label = doc.createElement("div");
	label.id = "tabby-bed-label";
	label.textContent = PET_NAME;
	bed.appendChild(label);

	const position = () => {
		const { x, y } = bedPosition({
			width: doc.documentElement.clientWidth,
			height: doc.documentElement.clientHeight,
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

export default mountBed;
