// Renders the PNG and ICO files in this folder from the SVG sources.
// Run from the repo root after `pnpm install`: node assets/brand/render.mjs
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = (file) => fileURLToPath(new URL(file, import.meta.url));
const web = (file) => fileURLToPath(new URL(`../../apps/web/${file}`, import.meta.url));
const { chromium } = createRequire(web("package.json"))("@playwright/test");

// [source svg, output file, size in px]
const outputs = [
  ["app-icon.svg", here("app-icon-1024.png"), 1024],
  ["avatar.svg", here("avatar-512.png"), 512],
  ["avatar.svg", web("public/apple-touch-icon.png"), 180],
  ["tray-template.svg", here("tray-template.png"), 16],
  ["tray-template.svg", here("tray-template@2x.png"), 32],
];
const favicon = [16, 32, 48];

// CHROMIUM_PATH points at a Chromium when Playwright's own build is not installed.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();

async function render(svg, size) {
  const source = await readFile(here(svg), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  return page.screenshot({ omitBackground: true });
}

for (const [svg, file, size] of outputs) await writeFile(file, await render(svg, size));

// An ICO file can hold PNGs as they are: a 6-byte header, a 16-byte entry per image, then the images.
const images = [];
for (const size of favicon) images.push(await render("mark.svg", size));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(favicon[i] % 256, entry);
  header.writeUInt8(favicon[i] % 256, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(web("public/favicon.ico"), Buffer.concat([header, ...images]));

await browser.close();
