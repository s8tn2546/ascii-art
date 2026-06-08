const CHARACTER_SETS = {
  linear: " .,:;i1tfLCG08@",
  stipple: " ·••●⬤",
  risograph: " +%@",
  cyanotype: " .,:;|[]#",
  thermal: " .,:;i1tfLCG08@",
  infrared: " .,:;i1tfLCG08@"
};

let frameMaxLuma = 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const CHARACTER_ASPECT = 0.58;

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

function fitRect(width, height, maxWidth, maxHeight) {
  const aspect = width / height;
  let fittedWidth = maxWidth;
  let fittedHeight = fittedWidth / aspect;

  if (fittedHeight > maxHeight) {
    fittedHeight = maxHeight;
    fittedWidth = fittedHeight * aspect;
  }

  return {
    x: (maxWidth - fittedWidth) / 2,
    y: (maxHeight - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight
  };
}

export function computeGrid(videoWidth, videoHeight, outputWidth, outputHeight, quantity) {
  const quantityNorm = clamp(quantity / 100, 0, 1);
  const drawRect = fitRect(videoWidth, videoHeight, outputWidth, outputHeight);
  const targetCellWidth = 8.4 - quantityNorm * 4.6;
  const columns = Math.round(drawRect.width / targetCellWidth);
  const aspect = videoHeight / videoWidth;
  const rows = Math.round(columns * aspect * CHARACTER_ASPECT);
  return {
    columns: clamp(columns, 52, 320),
    rows: clamp(rows, 30, 220),
    drawRect
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

function mapChar(level, texture) {
  const set = CHARACTER_SETS[texture] || CHARACTER_SETS.linear;
  if (texture === "stipple") {
    const spread = clamp(level + (Math.random() - 0.5) * 0.2, 0, 1);
    return set[Math.floor(spread * (set.length - 1))];
  }
  return set[Math.floor(level * (set.length - 1))];
}

function resolveColor(texture, mode, tintHex, px) {
  if (texture === "risograph" || mode === "risograph") {
    const normalized = clamp(px.luma / frameMaxLuma, 0, 1);
    const dithered = normalized + (Math.random() - 0.5) * 0.12;
    if (dithered < 0.35) return "rgb(25, 20, 90)";
    if (dithered < 0.80) return "rgb(235, 60, 50)";
    return "rgb(245, 230, 150)";
  }

  if (texture === "cyanotype") {
    const noisyLuma = clamp(px.luma + (Math.random() - 0.5) * 0.16, 0, 1);
    return noisyLuma < 0.45 ? "rgb(10, 50, 90)" : "rgb(190, 220, 240)";
  }

  if (texture === "thermal" || mode === "thermal") {
    const n = clamp(px.luma / frameMaxLuma, 0, 1);
    let r;
    let g;
    let b;
    if (n < 0.25) {
      const t = n / 0.25;
      r = Math.round(20 * t);
      g = 0;
      b = Math.round(80 + 120 * t);
    } else if (n < 0.50) {
      const t = (n - 0.25) / 0.25;
      r = 0;
      g = Math.round(180 * t);
      b = Math.round(200 - 200 * t);
    } else if (n < 0.75) {
      const t = (n - 0.50) / 0.25;
      r = Math.round(220 * t);
      g = Math.round(180 + 40 * t);
      b = 0;
    } else {
      const t = (n - 0.75) / 0.25;
      r = 255;
      g = Math.round(220 + 35 * t);
      b = Math.round(200 * t);
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (texture === "infrared" || mode === "infrared") {
    const n = clamp(px.luma / frameMaxLuma, 0, 1);
    const inverted = clamp(1 - n + (Math.random() - 0.5) * 0.06, 0, 1);
    const dark = { r: 10, g: 2, b: 5 };
    const mid = { r: 220, g: 50, b: 100 };
    const light = { r: 255, g: 240, b: 245 };
    let r;
    let g;
    let b;
    if (inverted < 0.25) {
      const t = inverted / 0.25;
      r = Math.round(dark.r + (mid.r - dark.r) * t);
      g = Math.round(dark.g + (mid.g - dark.g) * t);
      b = Math.round(dark.b + (mid.b - dark.b) * t);
    } else {
      const t = (inverted - 0.25) / 0.75;
      r = Math.round(mid.r + (light.r - mid.r) * t);
      g = Math.round(mid.g + (light.g - mid.g) * t);
      b = Math.round(mid.b + (light.b - mid.b) * t);
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

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
  controls
}) {
  if (!video.videoWidth || !video.videoHeight) {
    return { fpsEligible: false, gridLabel: "--" };
  }

  const frame = {
    x: 0,
    y: 0,
    width: video.videoWidth,
    height: video.videoHeight
  };

  const grid = computeGrid(
    frame.width,
    frame.height,
    outputCanvas.width,
    outputCanvas.height,
    controls.quantity
  );
  sampleCanvas.width = grid.columns;
  sampleCanvas.height = grid.rows;

  sampleCtx.drawImage(video, frame.x, frame.y, frame.width, frame.height, 0, 0, grid.columns, grid.rows);
  const imageData = sampleCtx.getImageData(0, 0, grid.columns, grid.rows);
  const data = imageData.data;
  frameMaxLuma = 0.01;
  for (let i = 0; i < data.length; i += 4) {
    const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    if (l > frameMaxLuma) frameMaxLuma = l;
  }

  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputCtx.fillStyle = "#04060c";
  outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  const cellW = grid.drawRect.width / grid.columns;
  const cellH = grid.drawRect.height / grid.rows;
  const fontSize = Math.max(6, Math.floor(Math.min(cellH * 1.02, cellW / CHARACTER_ASPECT)));
  outputCtx.font = `${fontSize}px JetBrains Mono, monospace`;
  outputCtx.textAlign = "center";
  outputCtx.textBaseline = "middle";

  const densityCutoff = (100 - controls.density) / 100;
  const noiseScale = controls.noise / 100;

  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.columns; x += 1) {
      const idx = (y * grid.columns + x) * 4;
      const pixel = sampleLuma(data, idx);

      let measure = pixel.luma;

      if (noiseScale > 0) {
        measure = clamp(measure + (Math.random() - 0.5) * noiseScale, 0, 1);
      }

      if (measure < densityCutoff && controls.texture !== "risograph" && controls.texture !== "thermal" && controls.texture !== "infrared") {
        continue;
      }

      const char = mapChar(measure, controls.texture);
      outputCtx.fillStyle = resolveColor(controls.texture, controls.colorMode, controls.tint, pixel);
      outputCtx.fillText(
        char,
        grid.drawRect.x + x * cellW + cellW * 0.5,
        grid.drawRect.y + y * cellH + cellH * 0.5
      );
    }
  }

  return {
    fpsEligible: true,
    gridLabel: `${grid.columns}x${grid.rows}`
  };
}
