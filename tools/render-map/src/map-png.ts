import { crc32, deflateSync } from "node:zlib";

export interface PngHex {
  x: number;
  y: number;
  fill: string;
  stroke?: string;
  missing?: boolean;
  mark?: "city" | "own-unit" | "foreign-unit" | "strategic" | "luxury";
  marker?: number;
}

export function renderHexPng(options: {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  tileSize: number;
  hexes: PngHex[];
}): Buffer {
  const radius = options.tileSize / 2;
  const hexWidth = Math.sqrt(3) * radius;
  const rowStep = radius * 1.5;
  const columns = options.bounds.maxX - options.bounds.minX + 1;
  const rows = options.bounds.maxY - options.bounds.minY + 1;
  const mapWidth = columns * hexWidth + hexWidth / 2;
  const mapHeight = rows <= 1 ? radius * 2 : radius * 2 + (rows - 1) * rowStep;
  const padding = 8;
  const width = Math.max(1, Math.ceil(mapWidth + padding * 2));
  const height = Math.max(1, Math.ceil(mapHeight + padding * 2));
  const rgb = new Uint8Array(width * height * 3);
  rgb.fill(248);
  for (let index = 1; index < rgb.length; index += 3) rgb[index] = 247;
  for (let index = 2; index < rgb.length; index += 3) rgb[index] = 242;

  for (const hex of options.hexes) {
    const column = hex.x - options.bounds.minX;
    const row = options.bounds.maxY - hex.y;
    const rowOffset = Math.abs(hex.y) % 2 === 1 ? hexWidth / 2 : 0;
    const cx = padding + hexWidth / 2 + column * hexWidth + rowOffset;
    const cy = padding + radius + row * rowStep;
    fillHex(rgb, width, height, cx, cy, radius * 0.96, parseColor(hex.missing ? "#d9d9d9" : hex.fill));
    if (hex.stroke) fillHex(rgb, width, height, cx, cy, radius * 0.78, parseColor(hex.stroke), true);
    if (hex.mark === "city") fillCircle(rgb, width, height, cx, cy, Math.max(3, radius * 0.28), parseColor("#f7c948"));
    if (hex.mark === "own-unit") fillCircle(rgb, width, height, cx + radius * 0.35, cy - radius * 0.28, Math.max(2.5, radius * 0.22), parseColor("#2f80ed"));
    if (hex.mark === "foreign-unit") fillCircle(rgb, width, height, cx + radius * 0.35, cy - radius * 0.28, Math.max(2.5, radius * 0.22), parseColor("#d64545"));
    if (hex.mark === "strategic") fillCircle(rgb, width, height, cx, cy, Math.max(2, radius * 0.16), parseColor("#f2c14e"));
    if (hex.mark === "luxury") fillCircle(rgb, width, height, cx, cy, Math.max(2, radius * 0.16), parseColor("#9b51e0"));
    if (typeof hex.marker === "number") drawDigits(rgb, width, height, cx, cy, hex.marker);
  }
  return encodePng(width, height, rgb);
}

function fillHex(rgb: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, color: [number, number, number], ring = false): void {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 180 * (60 * index - 30);
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as [number, number];
  });
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;
      if (ring) {
        const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (distance < radius * 0.72) continue;
      }
      const offset = (y * width + x) * 3;
      rgb[offset] = color[0];
      rgb[offset + 1] = color[1];
      rgb[offset + 2] = color[2];
    }
  }
}

function fillCircle(rgb: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number, color: [number, number, number]): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) continue;
      const offset = (y * width + x) * 3;
      rgb[offset] = color[0];
      rgb[offset + 1] = color[1];
      rgb[offset + 2] = color[2];
    }
  }
}

function pointInPolygon(x: number, y: number, points: Array<[number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [xi, yi] = points[index]!;
    const [xj, yj] = points[previous]!;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const DIGITS = [
  ["111", "101", "101", "101", "111"],
  ["010", "110", "010", "010", "111"],
  ["111", "001", "111", "100", "111"],
  ["111", "001", "111", "001", "111"],
  ["101", "101", "111", "001", "001"],
  ["111", "100", "111", "001", "111"],
  ["111", "100", "111", "101", "111"],
  ["111", "001", "001", "001", "001"],
  ["111", "101", "111", "101", "111"],
  ["111", "101", "111", "001", "111"]
];

function drawDigits(rgb: Uint8Array, width: number, height: number, cx: number, cy: number, value: number): void {
  const text = String(Math.max(0, Math.floor(value))).slice(0, 2);
  const scale = 2;
  const glyphWidth = 3 * scale;
  const total = text.length * (glyphWidth + scale);
  let originX = Math.round(cx - total / 2);
  const originY = Math.round(cy - (5 * scale) / 2);
  for (const character of text) {
    const rows = DIGITS[Number(character)] ?? DIGITS[0]!;
    rows.forEach((row, rowIndex) => {
      [...row].forEach((pixel, column) => {
        if (pixel !== "1") return;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            paint(rgb, width, height, originX + column * scale + dx, originY + rowIndex * scale + dy, [16, 24, 40]);
          }
        }
      });
    });
    originX += glyphWidth + scale;
  }
}

function paint(rgb: Uint8Array, width: number, height: number, x: number, y: number, color: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 3;
  rgb[offset] = color[0];
  rgb[offset + 1] = color[1];
  rgb[offset + 2] = color[2];
}

function parseColor(value: string): [number, number, number] {
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    rgb.subarray(y * width * 3, (y + 1) * width * 3).forEach((value, index) => {
      raw[rowStart + 1 + index] = value;
    });
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}
