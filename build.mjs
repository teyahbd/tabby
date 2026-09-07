import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";

const SPRITE_SHEET = "Cat Sprites/Calico Cat.png";
const BOWL_ART = {
	__TABBY_BOWL_EMPTY__: "src/assets/bowl-empty.png",
	__TABBY_BOWL_FULL__: "src/assets/bowl-full.png",
	__TABBY_BED__: "src/assets/bed.png",
};

const PIXEL_FONT = "src/assets/press-start-2p.woff2";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await esbuild.build({
	entryPoints: {
		content: "src/content/index.ts",
		background: "src/background/index.ts",
	},
	outdir: "dist",
	bundle: true,
	format: "iife",
	target: "chrome120",
	platform: "browser",
	minify: false,
	legalComments: "none",
	loader: { ".wav": "binary" },
});

await copyFile("manifest.json", "dist/manifest.json");

let css = await readFile("src/render/pet.css", "utf8");
try {
	const png = await readFile(SPRITE_SHEET);
	css = css.replaceAll(
		"__TABBY_SPRITE_SHEET__",
		`data:image/png;base64,${png.toString("base64")}`,
	);
	console.log(`inlined ${SPRITE_SHEET} (${png.length} bytes)`);
} catch {
	css = css.replaceAll("__TABBY_SPRITE_SHEET__", "");
	css +=
		"\n#tabby-sprite{background:#d69860;border-radius:12px 12px 8px 8px;box-shadow:inset 0 -6px 0 rgba(0,0,0,0.12);}\n";
	console.warn(`! ${SPRITE_SHEET} not found — pet will render as a plain box`);
}
for (const [token, path] of Object.entries(BOWL_ART)) {
	const png = await readFile(path);
	css = css.replaceAll(
		token,
		`data:image/png;base64,${png.toString("base64")}`,
	);
	console.log(`inlined ${path} (${png.length} bytes)`);
}

try {
	const font = await readFile(PIXEL_FONT);
	css = css.replaceAll(
		"__TABBY_PIXEL_FONT__",
		`data:font/woff2;base64,${font.toString("base64")}`,
	);
	console.log(`inlined ${PIXEL_FONT} (${font.length} bytes)`);
} catch {
	css = css.replaceAll('src: url("__TABBY_PIXEL_FONT__") format("woff2");', "");
	console.warn(
		`! ${PIXEL_FONT} not found — bed label falls back to a monospace font`,
	);
}

await writeFile("dist/pet.css", css);

console.log("built dist/");
