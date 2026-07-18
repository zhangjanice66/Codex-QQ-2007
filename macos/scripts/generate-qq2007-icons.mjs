#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CELL = 24;
const ICON_COUNT = 14;
const WIDTH = CELL * ICON_COUNT;
const HEIGHT = CELL;

const options = { out: path.join(root, "assets", "qq2007-icons.png") };
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === "--out" && process.argv[index + 1]) options.out = path.resolve(process.argv[++index]);
  else throw new Error(`Unknown option: ${process.argv[index]}`);
}

const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
const colors = {
  ink: "#24486d", blue: "#2f84cf", blueDark: "#1762aa", blueLight: "#9bd5ff",
  green: "#51a936", greenLight: "#b8ed78", yellow: "#f4bf2d", orange: "#e47a1c",
  red: "#d84b39", white: "#ffffff", paper: "#f5fbff", gray: "#8ba3b9", black: "#1c2e40",
};

function rgba(hex, alpha = 255) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255, alpha];
}

function dot(cell, x, y, color, alpha = 255) {
  if (x < 0 || x >= CELL || y < 0 || y >= CELL) return;
  const offset = ((y * WIDTH) + (cell * CELL) + x) * 4;
  pixels.set(rgba(color, alpha), offset);
}

function rect(cell, x, y, width, height, color, alpha = 255) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) dot(cell, xx, yy, color, alpha);
  }
}

function line(cell, x0, y0, x1, y1, color) {
  let dx = Math.abs(x1 - x0);
  let sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  let sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    dot(cell, x0, y0, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function frame(cell, x, y, width, height, fill, edge = colors.ink) {
  rect(cell, x, y, width, height, edge);
  rect(cell, x + 1, y + 1, width - 2, height - 2, fill);
  line(cell, x + 2, y + 1, x + width - 3, y + 1, colors.white);
}

function circle(cell, cx, cy, radius, fill, edge = fill) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = x * x + y * y;
      if (distance <= radius * radius) dot(cell, cx + x, cy + y, fill);
      if (distance <= radius * radius && distance >= (radius - 1) * (radius - 1)) dot(cell, cx + x, cy + y, edge);
    }
  }
}

function documentIcon(cell, accent, withClock = false) {
  frame(cell, 5, 3, 14, 18, colors.paper);
  rect(cell, 8, 7, 8, 1, colors.blueLight);
  rect(cell, 8, 10, 8, 1, colors.gray);
  rect(cell, 8, 13, 6, 1, colors.gray);
  if (withClock) {
    circle(cell, 16, 16, 5, colors.white, accent);
    line(cell, 16, 16, 16, 13, accent);
    line(cell, 16, 16, 19, 17, accent);
  } else {
    rect(cell, 3, 13, 8, 7, accent);
    rect(cell, 6, 15, 2, 3, colors.white);
    rect(cell, 4, 16, 6, 1, colors.white);
  }
}

function mascot(cell) {
  circle(cell, 12, 8, 6, colors.black, colors.ink);
  rect(cell, 8, 6, 8, 8, colors.black);
  rect(cell, 9, 7, 6, 5, colors.white);
  dot(cell, 10, 8, colors.black); dot(cell, 14, 8, colors.black);
  rect(cell, 10, 11, 4, 2, colors.yellow);
  rect(cell, 7, 13, 10, 6, colors.white);
  rect(cell, 6, 15, 12, 3, colors.red);
  rect(cell, 8, 18, 3, 3, colors.orange); rect(cell, 13, 18, 3, 3, colors.orange);
  line(cell, 8, 2, 15, 2, colors.blueLight);
}

function puzzle(cell) {
  rect(cell, 5, 5, 6, 6, colors.green); rect(cell, 12, 5, 7, 6, colors.yellow);
  rect(cell, 5, 12, 6, 7, colors.blue); rect(cell, 12, 12, 7, 7, colors.orange);
  circle(cell, 12, 7, 2, colors.green); circle(cell, 16, 12, 2, colors.yellow);
  line(cell, 5, 5, 10, 5, colors.white); line(cell, 12, 5, 18, 5, colors.white);
}

function globe(cell) {
  circle(cell, 12, 12, 9, colors.blue, colors.ink);
  line(cell, 4, 12, 20, 12, colors.white);
  line(cell, 12, 4, 12, 20, colors.white);
  line(cell, 6, 7, 18, 7, colors.blueLight);
  line(cell, 6, 17, 18, 17, colors.blueLight);
  line(cell, 8, 4, 6, 12, colors.white); line(cell, 6, 12, 8, 20, colors.white);
  line(cell, 16, 4, 18, 12, colors.white); line(cell, 18, 12, 16, 20, colors.white);
}

function branches(cell) {
  line(cell, 7, 5, 7, 18, colors.blueDark); line(cell, 7, 10, 16, 10, colors.blueDark);
  line(cell, 16, 10, 16, 18, colors.blueDark);
  circle(cell, 7, 5, 3, colors.greenLight, colors.green);
  circle(cell, 7, 18, 3, colors.blueLight, colors.blueDark);
  circle(cell, 16, 18, 3, "#ffd66e", colors.orange);
}

function bubbles(cell) {
  frame(cell, 3, 5, 14, 10, colors.white, colors.blueDark);
  rect(cell, 6, 8, 8, 1, colors.blueLight); rect(cell, 6, 11, 6, 1, colors.gray);
  dot(cell, 6, 15, colors.blueDark); dot(cell, 5, 16, colors.blueDark);
  frame(cell, 11, 12, 10, 7, "#fff2a8", colors.orange);
  dot(cell, 18, 19, colors.orange);
}

function envelope(cell) {
  frame(cell, 3, 6, 18, 13, colors.paper);
  line(cell, 4, 7, 12, 14, colors.blueDark); line(cell, 20, 7, 12, 14, colors.blueDark);
  line(cell, 4, 18, 10, 12, colors.blueLight); line(cell, 20, 18, 14, 12, colors.blueLight);
}

function star(cell) {
  const points = [[12,2],[14,8],[21,8],[16,12],[18,20],[12,16],[6,20],[8,12],[3,8],[10,8]];
  for (let i = 0; i < points.length; i += 1) line(cell, ...points[i], ...points[(i + 1) % points.length], colors.orange);
  for (let y = 6; y < 17; y += 1) for (let x = 5; x < 20; x += 1) {
    if (y >= Math.abs(x - 12) / 2 + 7 && y <= 17 - Math.abs(x - 12) / 2) dot(cell, x, y, colors.yellow);
  }
}

function people(cell) {
  circle(cell, 12, 7, 4, colors.yellow, colors.orange);
  circle(cell, 6, 10, 3, colors.blueLight, colors.blueDark);
  circle(cell, 18, 10, 3, colors.greenLight, colors.green);
  rect(cell, 8, 12, 8, 8, colors.orange); rect(cell, 3, 14, 5, 6, colors.blue); rect(cell, 16, 14, 5, 6, colors.green);
  line(cell, 9, 13, 15, 13, colors.white);
}

function folder(cell) {
  rect(cell, 3, 7, 18, 13, colors.orange);
  rect(cell, 4, 8, 16, 11, "#ffd45d");
  rect(cell, 5, 5, 7, 4, colors.orange); rect(cell, 6, 6, 6, 2, "#ffe79a");
  line(cell, 4, 10, 20, 10, colors.white);
}

function search(cell) {
  circle(cell, 10, 10, 6, colors.white, colors.blueDark);
  circle(cell, 10, 10, 4, colors.blueLight, colors.blue);
  line(cell, 14, 14, 21, 21, colors.ink); line(cell, 15, 14, 21, 20, colors.white);
}

function online(cell) {
  circle(cell, 12, 12, 9, colors.greenLight, colors.green);
  line(cell, 7, 12, 10, 16, colors.white); line(cell, 10, 16, 18, 7, colors.white);
  line(cell, 7, 11, 10, 14, colors.green); line(cell, 10, 14, 18, 6, colors.green);
}

function shield(cell) {
  rect(cell, 5, 4, 14, 9, colors.blueDark); rect(cell, 7, 5, 10, 9, colors.blue);
  for (let y = 13; y < 21; y += 1) rect(cell, 7 + (y - 13) / 2 | 0, y, 10 - (y - 13), 1, colors.blue);
  line(cell, 9, 11, 11, 14, colors.white); line(cell, 11, 14, 16, 8, colors.white);
  line(cell, 6, 4, 18, 4, colors.blueLight);
}

mascot(0);
documentIcon(1, colors.blue);
documentIcon(2, colors.orange, true);
puzzle(3);
globe(4);
branches(5);
bubbles(6);
envelope(7);
star(8);
people(9);
folder(10);
search(11);
online(12);
shield(13);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function storedZlib(data) {
  const parts = [Buffer.from([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 65535) {
    const length = Math.min(65535, data.length - offset);
    const header = Buffer.alloc(5);
    header[0] = offset + length === data.length ? 1 : 0;
    header.writeUInt16LE(length, 1);
    header.writeUInt16LE((~length) & 0xffff, 3);
    parts.push(header, data.subarray(offset, offset + length));
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(((b << 16) | a) >>> 0);
  parts.push(checksum);
  return Buffer.concat(parts);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
const scanlines = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  const row = y * (WIDTH * 4 + 1);
  scanlines[row] = 0;
  Buffer.from(pixels.buffer, y * WIDTH * 4, WIDTH * 4).copy(scanlines, row + 1);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", storedZlib(scanlines)),
  chunk("IEND", Buffer.alloc(0)),
]);

await fs.mkdir(path.dirname(options.out), { recursive: true });
await fs.writeFile(options.out, png);
