import { copyFile, mkdir, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

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
});

await copyFile("manifest.json", "dist/manifest.json");
await copyFile("src/render/pet.css", "dist/pet.css");

console.log("built dist/");
