// Erzeugt die App-Icons (PNG) ohne externe Abhängigkeiten.
// Aufruf: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

// Motiv: eine goldene Ähre auf grünem Grund (Kornspeicher)
const BG = [47, 107, 79]; // Dunkelgrün
const GRAIN = [236, 189, 82]; // Korn gold
const STEM = [214, 160, 58]; // Halm dunkleres Gold

function roundedRect(x0, y0, x1, y1, r) {
  return (px, py) => {
    if (px < x0 || px > x1 || py < y0 || py > y1) return false;
    const cx = Math.min(Math.max(px, x0 + r), x1 - r);
    const cy = Math.min(Math.max(py, y0 + r), y1 - r);
    return (px - cx) ** 2 + (py - cy) ** 2 <= r ** 2;
  };
}

/** Gedrehte Ellipse; angle in Grad, positiv = oberes Ende nach rechts geneigt */
function ellipse(cx, cy, rx, ry, angle) {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (px, py) => {
    const dx = px - cx;
    const dy = py - cy;
    const x = dx * cos + dy * sin;
    const y = -dx * sin + dy * cos;
    return (x / rx) ** 2 + (y / ry) ** 2 <= 1;
  };
}

// Alles innerhalb der 80-%-Sicherheitszone für "maskable"-Icons
const shapes = [{ test: roundedRect(0.485, 0.36, 0.515, 0.85, 0.015), color: STEM }];
for (let i = 0; i < 4; i++) {
  const y = 0.37 + i * 0.105;
  shapes.push({ test: ellipse(0.425, y, 0.04, 0.078, -38), color: GRAIN });
  shapes.push({ test: ellipse(0.575, y, 0.04, 0.078, 38), color: GRAIN });
}
shapes.push({ test: ellipse(0.5, 0.24, 0.04, 0.08, 0), color: GRAIN });

function colorAt(px, py) {
  let color = BG;
  for (const s of shapes) if (s.test(px, py)) color = s.color;
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
