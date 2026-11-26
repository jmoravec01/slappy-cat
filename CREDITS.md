# Credits

All graphics are drawn in code as pixel art (`public/js/render.js`, `public/js/pixel.js`); the music and the fallback sound
effects are synthesised with Web Audio. Third-party assets:

## Effects

Pixel effects (pickup bursts, hits, poof, confetti) and the 5x7 pixel font from pixelfx by Patch
(https://github.com/patch-gg/pixelfx), MIT licence: `public/vendor/pixelfx/LICENSE`. Parts of pixelfx adapt
Hugo Duprez's MIT effects.

## Font

Pixelify Sans by The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans), SIL Open Font License 1.1 (subset, weight 500): `public/fonts/OFL.txt`.

## Sounds

All CC0 1.0 (public domain, https://creativecommons.org/publicdomain/zero/1.0/), no attribution required, given anyway.
Processed with ffmpeg: mono, 44.1 kHz, leading silence removed, trimmed, peak-normalised to -1 dBFS, 20 ms fade-out, MP3.

| File | Source | Author |
| --- | --- | --- |
| `public/sounds/meow-up.mp3` | https://commons.wikimedia.org/wiki/File:Maullido_de_gata_hembra_joven.ogg (high-passed, first 0.85 s) | George Miquilena |
| `public/sounds/meow-down.mp3` | https://bigsoundbank.com/growling-cat-2-s1886.html (0.15–1.15 s) | Joseph Sardin, BigSoundBank (licence: https://bigsoundbank.com/licenses.html) |
| `public/sounds/slap.mp3` | https://bigsoundbank.com/slaps-s0597.html (first slap) | Joseph Sardin, BigSoundBank |
