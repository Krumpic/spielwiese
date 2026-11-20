// Erzeugt die App-Icons (PNG) ohne externe Abhängigkeiten.
// Aufruf: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const BG = [47, 107, 79]; // Dunkelgrün
const LID = [242, 193, 78]; // Deckel gelb
const JAR = [255, 255, 255]; // Glas weiß
const LABEL = [207, 232, 214]; // Etikett hellgrün

// Form in Einheitskoordinaten (0..1); alles innerhalb der 80-%-Sicherheitszone für "maskable"
const shapes = [
  { x0: 0.36, y0: 0.2, x1: 0.64, y1: 0.29, r: 0.03, color: LID },
  { x0: 0.28, y0: 0.31, x1: 0.72, y1: 0.8, r: 0.08, color: JAR },
  { x0: 0.28, y0: 0.48, x1: 0.72, y1: 0.62, r: 0, color: LABEL },
];

function inRoundedRect(px, py, s) {
  if (px < s.x0 || px > s.x1 || py < s.y0 || py > s.y1) return false;
  const cx = Math.min(Math.max(px, s.x0 + s.r), s.x1 - s.r);
  const cy = Math.min(Math.max(py, s.y0 + s.r), s.y1 - s.r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= s.r ** 2;
}

function colorAt(px, py) {
  let color = BG;
  for (const s of shapes)
    if (inRoundedRect(px, py, s))
      color = s === shapes[2] && !inRoundedRect(px, py, shapes[1]) ? color : s.color;
  return color;
}

function png(size) {
  const SS = 4; // Supersampling für weiche Kanten
  // Pro Zeile: 1 Filter-Byte (0 = keiner, durch alloc bereits gesetzt) + RGB-Pixel
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      raw.set(
        [r, g, b].map((sum) => Math.round(sum / SS ** 2)),
        offset,
      );
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", png(192));
writeFileSync("public/icon-512.png", png(512));
writeFileSync("public/apple-touch-icon.png", png(180));
console.log("Icons erzeugt: public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png");
