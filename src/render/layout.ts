export const PET_SIZE = 48;
export const BASE_MARGIN = 24;
export const BED_WIDTH = 64;
export const BED_HEIGHT = 40;

export interface Point {
	x: number;
	y: number;
}

export interface Viewport {
	width: number;
	height: number;
}

export function basePosition(viewport: Viewport, petSize = PET_SIZE): Point {
	return {
		x: Math.max(0, viewport.width - petSize - BASE_MARGIN),
		y: Math.max(0, viewport.height - petSize - BASE_MARGIN),
	};
}

export function bedPosition(viewport: Viewport): Point {
	const base = basePosition(viewport);
	return {
		x: base.x + (PET_SIZE - BED_WIDTH) / 2,
		y: base.y + (PET_SIZE - BED_HEIGHT),
	};
}
