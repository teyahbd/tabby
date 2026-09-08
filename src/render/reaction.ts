// Meow clips derived from "Black Cat Talking" by itinerantmonk108 (CC0,
// https://freesound.org/s/725686/). See CREDITS.md.
import meow1 from "../assets/sounds/meow_1.wav";
import meow2 from "../assets/sounds/meow_2.wav";
import meow3 from "../assets/sounds/meow_3.wav";
import meow4 from "../assets/sounds/meow_4.wav";

const MEOW_CLIPS = [meow1, meow2, meow3, meow4];
const MEOW_VOLUME = 0.2;

let audioContext: AudioContext | null = null;
const decodedClips = new Map<number, AudioBuffer>();

function getAudioContext(): AudioContext | null {
	const Ctor =
		globalThis.AudioContext ??
		(globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) return null;
	if (!audioContext) audioContext = new Ctor();
	return audioContext;
}

export function spawnHearts(
	container: HTMLElement,
	doc: Document = document,
	rng: () => number = Math.random,
): void {
	const count = 1 + Math.floor(rng() * 3);
	for (let i = 0; i < count; i++) {
		const heart = doc.createElement("div");
		heart.className = "tabby-heart";
		heart.textContent = "♥";
		heart.style.setProperty("--dx", `${Math.round((rng() - 0.5) * 48)}px`);
		heart.style.setProperty("--delay", `${i * 90}ms`);
		heart.addEventListener("animationend", () => heart.remove());
		container.appendChild(heart);
	}
}

export function playMeow(rng: () => number = Math.random): void {
	const ctx = getAudioContext();
	if (!ctx) return;
	void ctx.resume().catch(() => {});

	const index = Math.min(
		MEOW_CLIPS.length - 1,
		Math.floor(rng() * MEOW_CLIPS.length),
	);
	const bytes = MEOW_CLIPS[index];
	if (!bytes) return;

	const start = (buffer: AudioBuffer) => {
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const gain = ctx.createGain();
		gain.gain.value = MEOW_VOLUME;
		source.connect(gain).connect(ctx.destination);
		source.start();
	};

	const cached = decodedClips.get(index);
	if (cached) {
		start(cached);
		return;
	}

	ctx
		.decodeAudioData(bytes.slice().buffer)
		.then((buffer) => {
			decodedClips.set(index, buffer);
			start(buffer);
		})
		.catch(() => {});
}

export function reactToPet(
	root: HTMLElement,
	doc: Document = document,
	rng: () => number = Math.random,
): void {
	spawnHearts(root, doc, rng);
	playMeow(rng);
}

export default reactToPet;
