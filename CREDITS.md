# Credits

## Cat sprites

Pixel-art cat sprite pack by **DelineArte**.

- Source: <!-- TODO: add store/itch.io link -->
- License: use permitted in commercial and non-commercial projects;
  modification permitted. Reselling or redistributing the raw asset files is
  not. Attribution requested.

The raw sprite files are **not committed to this repo** (per the license's
no-redistribution term). To build the pet art locally, obtain the pack and
drop the files into `Cat Sprites/` (git-ignored), then run the build.

Only a processed, single-cat sprite sheet is embedded (as a data URI) in the
built `dist/` output.

## Bed, bowl, and laser pointer sprites

`src/assets/bed.png`, `src/assets/bowl-empty.png`, `src/assets/bowl-full.png`,
and `src/assets/laser-pointer.png` are hand-drawn pixel art by the project's author — original work, not part of the DelineArte pack. Committed to the repo.

## Meow sounds

The petting-reaction meows in `src/assets/sounds/` are derived from
"Black Cat Talking" by **itinerantmonk108**
(<https://freesound.org/s/725686/>), released under Creative Commons 0
(public domain). CC0 imposes no conditions; the credit is kept here as a
courtesy. The clip bytes are embedded in the built `dist/` output and played
via WebAudio.

## Bed name label font

The name label under the bed uses "Press Start 2P" (SIL Open Font License) when
`src/assets/press-start-2p.woff2` is present — `build.mjs` inlines it as a data
URI, no network fetch at runtime. The file is not committed yet; without it the
label falls back to a system monospace stack. Drop the `.woff2` in and rebuild
to get the pixel font.
