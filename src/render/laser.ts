import {
	LASER_DEVICE_HEIGHT,
	LASER_DEVICE_WIDTH,
	laserDevicePosition,
	laserTogglePosition,
	type Point,
} from "./layout.ts";

export const LASER_TOGGLE_ID = "tabby-laser-toggle";
export const LASER_DEVICE_ID = "tabby-laser-device";
export const LASER_BEAM_ID = "tabby-laser-beam";
export const LASER_BEAM_LINE_ID = "tabby-laser-beam-line";
export const LASER_BEAM_GLOW_A_ID = "tabby-laser-beam-glow-a";
export const LASER_BEAM_GLOW_B_ID = "tabby-laser-beam-glow-b";
export const LASER_BEAM_DOT_ID = "tabby-laser-beam-dot";

const BEAM_GLOW_OFFSET = 3;
const BEAM_DOT_RADIUS = 3;

const SVG_NS = "http://www.w3.org/2000/svg";

export interface LaserHandle {
	getIsActive: () => boolean;
	getCursor: () => Point | null;
	unmount: () => void;
}

export function mountLaser(doc: Document = document): LaserHandle {
	let active = false;
	let cursor: Point | null = null;
	let deviceAngle = 0;

	const toggle = doc.createElement("div");
	toggle.id = LASER_TOGGLE_ID;
	toggle.setAttribute("role", "button");
	toggle.setAttribute("aria-label", "Toggle laser pointer");

	const device = doc.createElement("div");
	device.id = LASER_DEVICE_ID;
	device.setAttribute("aria-hidden", "true");
	device.style.display = "none";

	const beam = doc.createElementNS(SVG_NS, "svg");
	beam.setAttribute("id", LASER_BEAM_ID);
	beam.setAttribute("aria-hidden", "true");
	beam.style.display = "none";
	const glowA = doc.createElementNS(SVG_NS, "line");
	glowA.setAttribute("id", LASER_BEAM_GLOW_A_ID);
	const glowB = doc.createElementNS(SVG_NS, "line");
	glowB.setAttribute("id", LASER_BEAM_GLOW_B_ID);
	const line = doc.createElementNS(SVG_NS, "line");
	line.setAttribute("id", LASER_BEAM_LINE_ID);
	const dot = doc.createElementNS(SVG_NS, "circle");
	dot.setAttribute("id", LASER_BEAM_DOT_ID);
	dot.setAttribute("r", String(BEAM_DOT_RADIUS));
	beam.appendChild(glowA);
	beam.appendChild(glowB);
	beam.appendChild(line);
	beam.appendChild(dot);

	const viewport = () => ({
		width: doc.documentElement.clientWidth,
		height: doc.documentElement.clientHeight,
	});

	const deviceTip = () => {
		const pos = laserDevicePosition(viewport());
		return {
			x: pos.x + LASER_DEVICE_WIDTH / 2,
			y: pos.y + LASER_DEVICE_HEIGHT / 2,
		};
	};

	const positionToggle = () => {
		const pos = laserTogglePosition(viewport());
		toggle.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
	};

	const applyDeviceTransform = (angleDeg: number) => {
		const pos = laserDevicePosition(viewport());
		device.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${angleDeg}deg)`;
	};

	const positionDevice = () => applyDeviceTransform(deviceAngle);

	const updateBeam = () => {
		const v = viewport();
		beam.setAttribute("width", String(v.width));
		beam.setAttribute("height", String(v.height));
		if (!cursor) return;
		const tip = deviceTip();
		line.setAttribute("x1", String(tip.x));
		line.setAttribute("y1", String(tip.y));
		line.setAttribute("x2", String(cursor.x));
		line.setAttribute("y2", String(cursor.y));

		const dx = cursor.x - tip.x;
		const dy = cursor.y - tip.y;
		const len = Math.hypot(dx, dy) || 1;
		const offsetX = (-dy / len) * BEAM_GLOW_OFFSET;
		const offsetY = (dx / len) * BEAM_GLOW_OFFSET;

		glowA.setAttribute("x1", String(tip.x + offsetX));
		glowA.setAttribute("y1", String(tip.y + offsetY));
		glowA.setAttribute("x2", String(cursor.x + offsetX));
		glowA.setAttribute("y2", String(cursor.y + offsetY));

		glowB.setAttribute("x1", String(tip.x - offsetX));
		glowB.setAttribute("y1", String(tip.y - offsetY));
		glowB.setAttribute("x2", String(cursor.x - offsetX));
		glowB.setAttribute("y2", String(cursor.y - offsetY));

		dot.setAttribute("cx", String(cursor.x));
		dot.setAttribute("cy", String(cursor.y));

		deviceAngle =
			Math.atan2(cursor.y - tip.y, cursor.x - tip.x) * (180 / Math.PI);
		applyDeviceTransform(deviceAngle);
	};

	const onMove = (event: Event) => {
		const e = event as MouseEvent;
		cursor = { x: e.clientX, y: e.clientY };
		if (active) updateBeam();
	};

	const setActive = (next: boolean) => {
		if (active === next) return;
		active = next;
		device.style.display = active ? "block" : "none";
		beam.style.display = active ? "block" : "none";
		if (active) {
			positionDevice();
			updateBeam();
		}
	};

	const onClick = () => setActive(!active);

	const onResize = () => {
		positionToggle();
		positionDevice();
		updateBeam();
	};

	positionToggle();
	positionDevice();
	toggle.addEventListener("click", onClick);
	doc.body.appendChild(toggle);
	doc.body.appendChild(device);
	doc.body.appendChild(beam);

	const view = doc.defaultView;
	view?.addEventListener("resize", onResize);
	view?.addEventListener("mousemove", onMove);

	return {
		getIsActive: () => active,
		getCursor: () => cursor,
		unmount: () => {
			view?.removeEventListener("resize", onResize);
			view?.removeEventListener("mousemove", onMove);
			toggle.removeEventListener("click", onClick);
			toggle.remove();
			device.remove();
			beam.remove();
		},
	};
}

export default mountLaser;
