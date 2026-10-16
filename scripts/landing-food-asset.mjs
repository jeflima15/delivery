// Optional asset maintenance; no network requests or image generation occur here.
// Usage: node scripts/landing-food-asset.mjs <generated-square-image.png>
// Source generated with the built-in image_gen tool on 2026-10-11.
// Prompt:
// Use case: photorealistic-natural
// Asset type: square food photograph for a fictional menu mockup on a restaurant-management landing page
// Primary request: an appetizing handmade burger with a golden brioche bun, melted cheese, fresh lettuce and tomato, with a small portion of French fries beside it on a cream ceramic plate.
// Scene/backdrop: a warm beige-terracotta tabletop and plain monochromatic warm terracotta background, with no distracting props.
// Style/medium: premium photorealistic editorial food photography, natural realistic texture, gently imperfect brioche and crisp fries.
// Composition/framing: square frame, centered burger and plate, three-quarter slightly elevated camera angle, close-up with enough breathing room around the food to crop for a mobile menu card.
// Lighting/mood: soft natural side light, warm inviting color, subtle grounded shadows.
// Constraints: one burger only, food and plate fully legible, no people, no faces, no hands, no text, no typography, no logos, no watermark, no packaging.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Provide the generated square image path.');
const source = await loadImage(await readFile(sourcePath));
if (source.width !== source.height) throw new Error('Expected a square source; this script only resizes and encodes.');

const canvas = createCanvas(640, 640);
const context = canvas.getContext('2d');
context.imageSmoothingEnabled = true;
context.imageSmoothingQuality = 'high';
context.drawImage(source, 0, 0, 640, 640);
const encoded = await canvas.encode('webp', 82);
if (encoded.byteLength > 150_000) throw new Error('Encoded asset exceeds the 150 KB budget.');
const output = new URL('../public/brand/landing-burger.webp', import.meta.url);
await writeFile(output, encoded, { flag: 'wx' });
console.log(`Saved ${output.pathname}: 640 × 640, ${encoded.byteLength} bytes.`);
