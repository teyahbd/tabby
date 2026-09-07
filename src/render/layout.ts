// Keep in sync with `--cell` in pet.css.
export const PET_SIZE = 144;
export const BASE_MARGIN = 24;
// Bed art is 48x32 native pixels, drawn at 4x so it stays on an integer scale.
export const BED_WIDTH = 192;
export const BED_HEIGHT = 128;
// The name label overlaps the bed, sitting near the bottom but clear of the
// bottom two rows of native pixels (2 rows * 4x scale).
export const BED_LABEL_BOTTOM_INSET = 8;
// Label line box height — keep in sync with font-size/line-height in pet.css.
export const BED_LABEL_LINE_HEIGHT = 14;
// Bowl art is 16x12 native pixels, drawn at 4x so it stays on an integer scale.
export const BOWL_WIDTH = 64;
export const BOWL_HEIGHT = 48;
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
	// The bed sprite is wider than the pet cell, so it is pinned to the
	// bottom-right corner with the same inset as the pet rather than centered on
	// the pet's footprint. Its bottom edge sits on the pet's floor.
	// Whole-pixel coords only — sub-pixel placement blurs `image-rendering:
	// pixelated` even when it is set correctly.
	return {
		x: Math.round(Math.max(0, viewport.width - BED_WIDTH - BASE_MARGIN)),
		y: Math.round(Math.max(0, viewport.height - BED_HEIGHT - BASE_MARGIN)),
	};
}

export function bedLabelPosition(viewport: Viewport): Point {
	const bed = bedPosition(viewport);
	return {
		x: bed.x,
		y: Math.round(
			bed.y + BED_HEIGHT - BED_LABEL_BOTTOM_INSET - BED_LABEL_LINE_HEIGHT,
		),
	};
}

export function bowlPosition(viewport: Viewport): Point {
	const bed = bedPosition(viewport);
	return {
		x: Math.max(0, bed.x - BOWL_GAP - BOWL_WIDTH),
		y: basePosition(viewport).y + (PET_SIZE - BOWL_HEIGHT),
	};
}

export function bowlFeedSpot(viewport: Viewport): Point {
	const bowl = bowlPosition(viewport);
	return {
		x: Math.max(0, bowl.x - (PET_SIZE - BOWL_WIDTH) / 2),
		y: basePosition(viewport).y,
	};
}
