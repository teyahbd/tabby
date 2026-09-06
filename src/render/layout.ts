export const PET_SIZE = 48;
export const BASE_MARGIN = 24;
export const BED_WIDTH = 64;
export const BED_HEIGHT = 40;
export const BOWL_SIZE = 28;
export const BOWL_GAP = 14;

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

export function bowlPosition(viewport: Viewport): Point {
	const bed = bedPosition(viewport);
	return {
		x: Math.max(0, bed.x - BOWL_GAP - BOWL_SIZE),
		y: basePosition(viewport).y + (PET_SIZE - BOWL_SIZE),
	};
}

export function bowlFeedSpot(viewport: Viewport): Point {
	const bowl = bowlPosition(viewport);
	return {
		x: Math.max(0, bowl.x - (PET_SIZE - BOWL_SIZE) / 2),
		y: basePosition(viewport).y,
	};
}
