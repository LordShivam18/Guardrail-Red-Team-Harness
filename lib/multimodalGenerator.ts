const SVG_WIDTH = 1024;
const SVG_HEIGHT = 576;
const MAX_PAYLOAD_CHARS = 3_000;
const WRAP_COLUMN = 42;

type TextLayer = {
  text: string;
  x: number;
  y: number;
  opacity: number;
  fontSize: number;
  rotation: number;
  fill: string;
  letterSpacing: number;
};

export function generateAdversarialCanvas(payloadText: string): string {
  if (typeof payloadText !== "string") {
    throw new TypeError("payloadText must be a string.");
  }

  const payload = normalizePayload(payloadText);
  const seed = getDeterministicSeed(payload);
  const visibleLines = wrapText(payload, WRAP_COLUMN).slice(0, 12);
  const microLines = buildMicroTextLayers(payload, seed);
  const diagonalLines = buildDiagonalTextLayers(visibleLines, seed);
  const watermarkLines = buildWatermarkTextLayers(payload, seed);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-label="adversarial optical prompt injection">`,
    "<defs>",
    '<linearGradient id="background" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#f8fafc"/>',
    '<stop offset="48%" stop-color="#ffffff"/>',
    '<stop offset="100%" stop-color="#eef2ff"/>',
    "</linearGradient>",
    '<filter id="soften" x="-10%" y="-10%" width="120%" height="120%">',
    '<feGaussianBlur stdDeviation="0.22"/>',
    "</filter>",
    "</defs>",
    '<rect width="100%" height="100%" fill="url(#background)"/>',
    '<g opacity="0.28">',
    buildNoise(seed),
    "</g>",
    '<g font-family="Arial, Helvetica, sans-serif" text-rendering="geometricPrecision">',
    renderTextLayers(microLines),
    renderTextLayers(diagonalLines),
    renderTextLayers(watermarkLines),
    "</g>",
    '<rect x="18" y="18" width="988" height="540" fill="none" stroke="#cbd5e1" stroke-width="1" opacity="0.45"/>',
    "</svg>"
  ].join("");

  return `data:image/svg+xml;base64,${encodeBase64(svg)}`;
}

function normalizePayload(payloadText: string) {
  const normalized = payloadText.replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new Error("payloadText must contain visible text.");
  }

  return normalized.slice(0, MAX_PAYLOAD_CHARS);
}

function buildMicroTextLayers(payload: string, seed: number): TextLayer[] {
  const repeatedPayload = repeatToLength(payload, 120);
  const layers: TextLayer[] = [];

  for (let row = 0; row < 15; row += 1) {
    const jitter = pseudoRandom(seed + row * 17);
    layers.push({
      text: repeatedPayload,
      x: -60 + jitter * 35,
      y: 34 + row * 36,
      opacity: 0.055 + jitter * 0.035,
      fontSize: 9 + (row % 3),
      rotation: row % 2 === 0 ? -1.8 : 1.3,
      fill: row % 3 === 0 ? "#0f172a" : "#334155",
      letterSpacing: 1.2
    });
  }

  return layers;
}

function buildDiagonalTextLayers(lines: string[], seed: number): TextLayer[] {
  return lines.map((line, index) => {
    const jitter = pseudoRandom(seed + index * 29);

    return {
      text: line,
      x: 126 + jitter * 34,
      y: 118 + index * 28,
      opacity: 0.16 + jitter * 0.08,
      fontSize: 22,
      rotation: -8.5 + jitter * 2.8,
      fill: "#111827",
      letterSpacing: 0.4
    };
  });
}

function buildWatermarkTextLayers(payload: string, seed: number): TextLayer[] {
  const words = payload.split(" ").filter(Boolean);
  const fragments = words.length > 0 ? words : [payload];
  const layers: TextLayer[] = [];

  for (let index = 0; index < 22; index += 1) {
    const jitter = pseudoRandom(seed + index * 43);
    const fragment = fragments[index % fragments.length] ?? payload;

    layers.push({
      text: fragment,
      x: 40 + ((index * 89) % 920),
      y: 72 + ((index * 53) % 440),
      opacity: 0.08 + jitter * 0.07,
      fontSize: 13 + (index % 5),
      rotation: -24 + jitter * 48,
      fill: index % 2 === 0 ? "#1d4ed8" : "#7f1d1d",
      letterSpacing: 0.8
    });
  }

  return layers;
}

function renderTextLayers(layers: TextLayer[]) {
  return layers
    .map((layer) => {
      const escapedText = escapeXml(layer.text);

      return [
        `<text x="${round(layer.x)}" y="${round(layer.y)}"`,
        `font-size="${round(layer.fontSize)}"`,
        `fill="${layer.fill}"`,
        `opacity="${round(layer.opacity)}"`,
        `letter-spacing="${round(layer.letterSpacing)}"`,
        'filter="url(#soften)"',
        `transform="rotate(${round(layer.rotation)} ${round(layer.x)} ${round(layer.y)})">${escapedText}</text>`
      ].join(" ");
    })
    .join("");
}

function buildNoise(seed: number) {
  const circles: string[] = [];

  for (let index = 0; index < 140; index += 1) {
    const x = Math.floor(pseudoRandom(seed + index * 3) * SVG_WIDTH);
    const y = Math.floor(pseudoRandom(seed + index * 5) * SVG_HEIGHT);
    const radius = 0.35 + pseudoRandom(seed + index * 7) * 1.1;
    const opacity = 0.08 + pseudoRandom(seed + index * 11) * 0.18;
    circles.push(
      `<circle cx="${x}" cy="${y}" r="${round(radius)}" fill="#64748b" opacity="${round(opacity)}"/>`
    );
  }

  return circles.join("");
}

function wrapText(text: string, column: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > column && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function repeatToLength(value: string, length: number) {
  let output = value;

  while (output.length < length) {
    output = `${output} ${value}`;
  }

  return output.slice(0, length);
}

function getDeterministicSeed(value: string) {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function pseudoRandom(seed: number) {
  const value = Math.sin(seed) * 10_000;
  return value - Math.floor(value);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function encodeBase64(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return globalThis.btoa(binary);
}

function round(value: number) {
  return Number(value.toFixed(3));
}
