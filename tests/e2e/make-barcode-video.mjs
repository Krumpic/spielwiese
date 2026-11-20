// Erzeugt ein Y4M-Video (Fake-Webcam) mit einem EAN-13-Barcode.
import { writeFileSync } from "node:fs";

const [, , out, code] = process.argv;
const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const R = L.map((p) => [...p].map((b) => (b === "0" ? "1" : "0")).join(""));
const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

const d = [...code].map(Number);
const sum = d
  .slice(0, 12)
  .reverse()
  .reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
if ((10 - (sum % 10)) % 10 !== d[12]) throw new Error("Prüfziffer falsch");

let bits = "101";
const parity = PARITY.at(d[0]) ?? "";
for (let i = 1; i <= 6; i++) bits += (parity.at(i - 1) === "L" ? L : G).at(d.at(i)) ?? "";
bits += "01010";
for (let i = 7; i <= 12; i++) bits += R.at(d.at(i)) ?? "";
bits += "101";

const W = 640,
  H = 480,
  M = 4;
const x0 = Math.floor((W - bits.length * M) / 2);
const y = new Uint8Array(W * H).fill(235);
for (let row = 150; row < 330; row++)
  for (let i = 0; i < bits.length; i++)
    if (bits.at(i) === "1") y.fill(20, row * W + x0 + i * M, row * W + x0 + (i + 1) * M);
const chroma = new Uint8Array((W / 2) * (H / 2)).fill(128);
const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`);
writeFileSync(out, Buffer.concat([header, ...Array(15).fill(frame)]));
console.log(`Video mit EAN-13 ${code} erzeugt: ${out}`);
