import { bedLabelPosition, bedPosition } from "./layout.ts";

export const BED_ID = "tabby-bed";
export const BED_LABEL_ID = "tabby-bed-label";
export const PET_NAME = "Tabby";

export function mountBed(doc: Document = document): () => void {
	if (doc.getElementById(BED_ID)) return () => {};

	const bed = doc.createElement("div");
	bed.id = BED_ID;

	const label = doc.createElement("div");
	label.id = BED_LABEL_ID;
	label.textContent = PET_NAME;

	const position = () => {
		const viewport = {
			width: doc.documentElement.clientWidth,
			height: doc.documentElement.clientHeight,
		};
		const pos = bedPosition(viewport);
		bed.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
		const labelPos = bedLabelPosition(viewport);
		label.style.transform = `translate(${labelPos.x}px, ${labelPos.y}px)`;
	};

	position();
	doc.body.appendChild(bed);
	doc.body.appendChild(label);

	const view = doc.defaultView;
	view?.addEventListener("resize", position);

	return () => {
		view?.removeEventListener("resize", position);
		bed.remove();
		label.remove();
	};
}

export default mountBed;
