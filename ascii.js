const CHARACTER_SETS = {
  linear: " .,:;i1tfLCG08@",
  edge: " .'`^,:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  stipple: " .`^*oO#@"
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const parsed = parseInt(normalized, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function mixColor(a, b, amount) {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount)
  };
}

export function computeGrid(videoWidth, videoHeight, quantity) {
  const quantityNorm = quantity / 100;
  const columns = Math.round(46 + quantityNorm * 150);
  const aspect = videoHeight / videoWidth;
  const rows = Math.round(columns * aspect * 0.62);
  return {
    columns: clamp(columns, 34, 210),
    rows: clamp(rows, 22, 140)
  };
}

function sampleLuma(data, index) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  return {
    luma: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
    r,
    g,
    b
  };
}

function edgeValue(data, pxIndex, width) {
  const safe = clamp(pxIndex, 0, data.length - 4);
  const left = safe - 4 < 0 ? safe : safe - 4;
  const right = safe + 4 >= data.length ? safe : safe + 4;
  const up = safe - width * 4 < 0 ? safe : safe - width * 4;
  const down = safe + width * 4 >= data.length ? safe : safe + width * 4;

  const l = sampleLuma(data, left).luma;
  const r = sampleLuma(data, right).luma;
  const u = sampleLuma(data, up).luma;
  const d = sampleLuma(data, down).luma;

  return clamp(Math.abs(l - r) + Math.abs(u - d), 0, 1);
}

function mapChar(level, texture) {
  const set = CHARACTER_SETS[texture] || CHARACTER_SETS.linear;
  if (texture === "stipple") {
    const spread = clamp(level + (Math.random() - 0.5) * 0.2, 0, 1);
    return set[Math.floor(spread * (set.length - 1))];
  }
  return set[Math.floor(level * (set.length - 1))];
}

function resolveColor(mode, tintHex, px) {
  if (mode === "rgb") {
    const luma = px.luma;
    const contrast = 1.28;
    const saturationBoost = 1.45;
    const brightnessLift = 26;
    const gray = (px.r + px.g + px.b) / 3;

    const applyChannel = (channel) => {
      const contrasted = (channel - 128) * contrast + 128;
      const saturated = gray + (contrasted - gray) * saturationBoost;
      const warmLift = channel * 0.08 + 8;
      const lifted = saturated + brightnessLift + luma * 18 + warmLift;
      return clamp(Math.round(lifted), 0, 255);
    };

    return `rgb(${applyChannel(px.r)}, ${applyChannel(px.g)}, ${applyChannel(px.b)})`;
  }

  if (mode === "gradient") {
    const low = { r: 104, g: 145, b: 255 };
    const high = { r: 113, g: 248, b: 205 };
    const mapped = mixColor(low, high, px.luma);
    return `rgb(${mapped.r}, ${mapped.g}, ${mapped.b})`;
  }

  const tint = hexToRgb(tintHex);
  const depthMix = mixColor({ r: 22, g: 28, b: 48 }, tint, px.luma);
  return `rgb(${depthMix.r}, ${depthMix.g}, ${depthMix.b})`;
}

export function renderAsciiFrame({
  sampleCtx,
  outputCtx,
  sampleCanvas,
  outputCanvas,
  video,
  controls,
  focusRect
}) {
  if (!video.videoWidth || !video.videoHeight) {
    return { fpsEligible: false, gridLabel: "--" };
  }

  const crop = focusRect || {
    x: 0,
    y: 0,
    width: video.videoWidth,
    height: video.videoHeight
  };

  const grid = computeGrid(crop.width, crop.height, controls.quantity);
  sampleCanvas.width = grid.columns;
  sampleCanvas.height = grid.rows;

  sampleCtx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, grid.columns, grid.rows);
  const imageData = sampleCtx.getImageData(0, 0, grid.columns, grid.rows);
  const data = imageData.data;

  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputCtx.fillStyle = "#04060c";
  outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  const cellW = outputCanvas.width / grid.columns;
  const cellH = outputCanvas.height / grid.rows;
  const fontSize = Math.max(6, Math.floor(cellH * 1.08));
  outputCtx.font = `${fontSize}px JetBrains Mono, monospace`;
  outputCtx.textBaseline = "middle";

  const densityCutoff = (100 - controls.density) / 100;
  const noiseScale = controls.noise / 100;

  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.columns; x += 1) {
      const idx = (y * grid.columns + x) * 4;
      const pixel = sampleLuma(data, idx);

      let measure = pixel.luma;
      if (controls.texture === "edge") {
        measure = edgeValue(data, idx, grid.columns);
      }

      if (noiseScale > 0) {
        measure = clamp(measure + (Math.random() - 0.5) * noiseScale, 0, 1);
      }

      if (measure < densityCutoff) {
        continue;
      }

      const char = mapChar(measure, controls.texture);
      outputCtx.fillStyle = resolveColor(controls.colorMode, controls.tint, pixel);
      outputCtx.fillText(char, x * cellW, y * cellH + cellH * 0.5);
    }
  }

  return {
    fpsEligible: true,
    gridLabel: `${grid.columns}x${grid.rows}`
  };
}
