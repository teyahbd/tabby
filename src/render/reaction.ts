const PURR_BASE_HZ = [55, 62, 70];

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
		heart.style.setProperty("--dx", `${Math.round((rng() - 0.5) * 32)}px`);
		heart.style.setProperty("--delay", `${i * 90}ms`);
		heart.addEventListener("animationend", () => heart.remove());
		container.appendChild(heart);
	}
}

export function playPurr(rng: () => number = Math.random): void {
	const Ctor =
		globalThis.AudioContext ??
		(globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
			.webkitAudioContext;
	if (!Ctor) return;

	const ctx = new Ctor();
	const now = ctx.currentTime;
	const dur = 0.55;
	const base = PURR_BASE_HZ[Math.floor(rng() * PURR_BASE_HZ.length)] ?? 60;

	const osc = ctx.createOscillator();
	osc.type = "sawtooth";
	osc.frequency.value = base;

	const lowpass = ctx.createBiquadFilter();
	lowpass.type = "lowpass";
	lowpass.frequency.value = 320;

	const lfo = ctx.createOscillator();
	lfo.type = "sine";
	lfo.frequency.value = 25;
	const lfoDepth = ctx.createGain();
	lfoDepth.gain.value = 0.35;

	const amp = ctx.createGain();
	amp.gain.setValueAtTime(0, now);
	amp.gain.linearRampToValueAtTime(0.5, now + 0.08);
	amp.gain.setValueAtTime(0.5, now + dur - 0.15);
	amp.gain.linearRampToValueAtTime(0, now + dur);

	lfo.connect(lfoDepth).connect(amp.gain);
	osc.connect(lowpass).connect(amp).connect(ctx.destination);

	osc.start(now);
	lfo.start(now);
	osc.stop(now + dur);
	lfo.stop(now + dur);
	osc.onended = () => void ctx.close();
}

export function reactToPet(
	root: HTMLElement,
	doc: Document = document,
	rng: () => number = Math.random,
): void {
	spawnHearts(root, doc, rng);
	playPurr(rng);
}

export default reactToPet;
