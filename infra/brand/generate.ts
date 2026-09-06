import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Sharp from "../../packages/adapters/node_modules/sharp/dist/index.cjs";
import { assistantCharacters, brandMark } from "../../packages/ui-tokens/src/brand.js";

// Reuse the repository's installed rasterizer; this script never fetches tooling.
const require = createRequire(new URL("../../packages/adapters/package.json", import.meta.url));
const sharp = require("sharp") as typeof Sharp;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const background = "#FAFAFC";

function mark(monochrome?: string) {
  const defs = monochrome
    ? ""
    : `<defs>${brandMark.gradients
        .map(
          (gradient, i) =>
            `<linearGradient id="mark-${i}" x1="${gradient.x1}" y1="${gradient.y1}" x2="${gradient.x2}" y2="${gradient.y2}" gradientUnits="userSpaceOnUse">${gradient.stops.map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`).join("")}</linearGradient>`,
        )
        .join("")}</defs>`;
  return `${defs}${brandMark.paths.map((path, i) => `<path d="${path}" fill="${monochrome ?? `url(#mark-${i})`}"/>`).join("")}`;
}

function svg(mode: "mark" | "app" | "mac" | "adaptive" | "mono" | "notification", ink?: string) {
  const size =
    mode === "mark" || mode === "notification"
      ? 64
      : mode === "adaptive" || mode === "mono"
        ? 96
        : 80;
  const inset = (size - 64) / 2;
  const bg =
    mode === "app"
      ? `<rect width="80" height="80" fill="${background}"/>`
      : mode === "mac"
        ? `<rect x="3" y="3" width="74" height="74" rx="17" fill="${background}"/>`
        : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" fill="none"><title>2hands</title>${bg}<g transform="translate(${inset} ${inset})">${mark(ink ?? (mode === "mono" || mode === "notification" ? "#FFFFFF" : undefined))}</g></svg>\n`;
}

async function put(path: string, data: string | Buffer) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

async function png(mode: Parameters<typeof svg>[0], size: number) {
  const rendered = sharp(Buffer.from(svg(mode))).resize(size, size);
  return (mode === "app" ? rendered.flatten({ background }) : rendered).png().toBuffer();
}

async function ico() {
  const sizes = [16, 32, 48, 256];
  const images = await Promise.all(sizes.map((size) => png("app", size)));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((data, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] === 256 ? 0 : (sizes[index] ?? 0);
    header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images]);
}

for (const app of ["web", "www"]) {
  const base = `apps/${app}/public`;
  await put(`${base}/brand/twohands-mark.svg`, svg("mark"));
  await put(`${base}/brand/twohands-mark-mono.svg`, svg("mark", "#252529"));
  await put(`${base}/brand/twohands-mark-reversed.svg`, svg("mark", "#FFFFFF"));
  await put(`${base}/favicon.svg`, svg("mark"));
  await put(`${base}/favicon.ico`, await ico());
  for (const [name, size] of [
    ["favicon-16x16.png", 16],
    ["favicon-32x32.png", 32],
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ] as const) {
    await put(`${base}/${name}`, await png("app", size));
  }
  const manifestPath = `${base}/site.webmanifest`;
  const manifest = JSON.parse(await readFile(join(root, manifestPath), "utf8"));
  Object.assign(manifest, {
    name: "2hands",
    short_name: "2hands",
    description: "Your AI workspace. Built on Rakazo.",
    background_color: background,
    theme_color: background,
  });
  await put(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

for (const character of assistantCharacters) {
  const { gradient: g, palette: p } = character;
  const artwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none"><title>${character.name}</title><defs><radialGradient id="body" cx="${g.cx}" cy="${g.cy}" r="${g.r}" gradientUnits="userSpaceOnUse"><stop stop-color="${p.start}"/><stop offset="${g.middleOffset}" stop-color="${p.middle}"/><stop offset="1" stop-color="${p.end}"/></radialGradient></defs><path d="${character.path}" fill="url(#body)"/><g fill="${p.eye}">${character.eyes.map((e) => `<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="${e.rx}"/>`).join("")}</g></svg>\n`;
  await put(`apps/www/public/characters/${character.name.toLowerCase()}.svg`, artwork);
}

for (const [name, mode, size] of [
  ["icon.png", "app", 1024],
  ["adaptive-icon.png", "adaptive", 1024],
  ["monochrome-icon.png", "mono", 1024],
  ["splash-icon.png", "adaptive", 1024],
  ["notification-icon.png", "notification", 96],
  ["favicon.png", "app", 48],
] as const) {
  await put(`apps/mobile/assets/${name}`, await png(mode, size));
}
await put(
  "apps/mobile/modules/rakazo-notifications/android/src/main/res/drawable/ic_rakazo_notification.xml",
  `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="64" android:viewportHeight="64">${brandMark.paths.map((path) => `<path android:fillColor="#FFFFFFFF" android:pathData="${path}"/>`).join("")}</vector>\n`,
);
await put("apps/desktop/assets/icon.png", await png("app", 1024));
await put("apps/desktop/assets/icon-macos.png", await png("mac", 1024));
await put("apps/desktop/assets/icon.ico", await ico());

if (process.platform === "darwin") {
  const temporary = await mkdtemp(join(tmpdir(), "twohands-brand-"));
  const iconset = join(temporary, "2hands.iconset");
  await mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    await writeFile(join(iconset, `icon_${size}x${size}.png`), await png("mac", size));
    await writeFile(join(iconset, `icon_${size}x${size}@2x.png`), await png("mac", size * 2));
  }
  execFileSync("iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    join(root, "apps/desktop/assets/icon.icns"),
  ]);
}
if (process.platform !== "darwin") {
  console.warn("macOS .icns was not regenerated. Run on macOS before packaging a Mac release.");
}
console.log("Generated 2hands brand assets for web, marketing, desktop, and mobile.");
