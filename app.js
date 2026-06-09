import { renderAsciiFrame } from "./ascii.js";
import { bindControls } from "./controls.js";
import { downloadPngFromCanvas } from "./export.js";

const elements = {
  cameraVideo: document.getElementById("cameraVideo"),
  sampleCanvas: document.getElementById("sampleCanvas"),
  asciiCanvas: document.getElementById("asciiCanvas"),
  statusText: document.getElementById("statusText"),

  settingsBtn: document.getElementById("settingsBtn"),
  captureBtn: document.getElementById("captureBtn"),
  settingsPanel: document.getElementById("settingsPanel"),

  densityRange: document.getElementById("densityRange"),
  densityValue: document.getElementById("densityValue"),
  quantityRange: document.getElementById("quantityRange"),
  quantityValue: document.getElementById("quantityValue"),
  noiseRange: document.getElementById("noiseRange"),
  noiseValue: document.getElementById("noiseValue"),
  textureSelect: document.getElementById("textureSelect"),
  colorModeSelect: document.getElementById("colorModeSelect"),
  tintPicker: document.getElementById("tintPicker")
};

const sampleCtx = elements.sampleCanvas.getContext("2d", { willReadFrequently: true });
const outputCtx = elements.asciiCanvas.getContext("2d");

const state = {
  stream: null,
  running: false,
  hasRenderedFrame: false,
  controls: {
    density: Number(elements.densityRange.value),
    quantity: Number(elements.quantityRange.value),
    noise: Number(elements.noiseRange.value),
    texture: elements.textureSelect.value,
    colorMode: elements.colorModeSelect.value,
    tint: elements.tintPicker.value
  },
  fps: {
    count: 0,
    lastSecond: performance.now(),
    value: 0
  },
  frameThrottleMs: 33,
  lastRender: 0,
  rafId: 0,
  dirty: true
};

function updateAdaptiveThrottle() {
  const mobile = window.matchMedia("(max-width: 680px)").matches;
  state.frameThrottleMs = mobile ? 50 : 33;
}

function setStatus(text, isError = false) {
  if (!elements.statusText) {
    return;
  }

  elements.statusText.textContent = text;
  elements.statusText.setAttribute("data-type", isError ? "error" : "ok");
  elements.statusText.style.color = isError ? "#ff9fb2" : "#71f8cd";
  elements.statusText.style.borderColor = isError
    ? "rgba(255, 107, 135, 0.45)"
    : "rgba(113, 248, 205, 0.35)";
}


function resizeOutputCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = elements.asciiCanvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width * dpr));
  const height = Math.max(220, Math.floor(rect.height * dpr));

  if (elements.asciiCanvas.width !== width || elements.asciiCanvas.height !== height) {
    elements.asciiCanvas.width = width;
    elements.asciiCanvas.height = height;
    state.dirty = true;
  }
}

async function startCamera() {
  if (state.running) {
    return;
  }

  if (!window.isSecureContext) {
    setStatus("Camera requires HTTPS or localhost", true);
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Camera API unsupported in this browser", true);
    return;
  }

  try {
    setStatus("Requesting camera...");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      },
      audio: false
    });

    elements.cameraVideo.srcObject = stream;
    await elements.cameraVideo.play();

    state.stream = stream;
    state.running = true;
    state.lastRender = 0;
    state.fps.lastSecond = performance.now();
    state.fps.count = 0;
    state.fps.value = 0;
    state.hasRenderedFrame = false;
    state.dirty = true;

    elements.captureBtn.disabled = false;
    setStatus("Live");

    runLoop();
  } catch (error) {
    const reason = error?.name || "Unknown error";
    if (reason === "NotAllowedError") {
      setStatus("Camera permission denied", true);
      return;
    }
    if (reason === "NotFoundError") {
      setStatus("No camera device found", true);
      return;
    }
    setStatus(`Camera error: ${reason}`, true);
  }
}

function stopCamera() {
  state.running = false;
  state.hasRenderedFrame = false;

  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = 0;
  }

  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
    state.stream = null;
  }

  elements.cameraVideo.srcObject = null;
  elements.captureBtn.disabled = true;

  outputCtx.fillStyle = "#04060c";
  outputCtx.fillRect(0, 0, elements.asciiCanvas.width, elements.asciiCanvas.height);
  setStatus("Stopped");
}

function runLoop(now = performance.now()) {
  if (!state.running) {
    return;
  }

  state.rafId = requestAnimationFrame(runLoop);

  if (document.hidden) {
    return;
  }

  if (!state.dirty && now - state.lastRender < state.frameThrottleMs) {
    return;
  }

  state.lastRender = now;
  const result = renderAsciiFrame({
    sampleCtx,
    outputCtx,
    sampleCanvas: elements.sampleCanvas,
    outputCanvas: elements.asciiCanvas,
    video: elements.cameraVideo,
    controls: state.controls
  });

  if (result.fpsEligible) {
    state.hasRenderedFrame = true;
    state.dirty = false;
  }
}

async function handleDeviceChange() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasVideoInput = devices.some((d) => d.kind === "videoinput");

    if (!hasVideoInput) {
      stopCamera();
      setStatus("Camera disconnected", true);
      return;
    }

    if (state.running) {
      state.dirty = true;
      setStatus("Camera devices updated");
    }
  } catch (_err) {
    if (state.running) {
      setStatus("Camera device update failed", true);
    }
  }
}

function initLifecycle() {
  updateAdaptiveThrottle();
  window.addEventListener("resize", resizeOutputCanvas, { passive: true });
  window.addEventListener("resize", updateAdaptiveThrottle, { passive: true });
  window.addEventListener("orientationchange", () => {
    resizeOutputCanvas();
    updateAdaptiveThrottle();
    state.dirty = true;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) {
      setStatus("Paused");
      return;
    }

    if (!document.hidden) {
      state.dirty = true;
      if (state.running) {
        setStatus("Live");
      }
      if (state.running && !state.rafId) {
        runLoop();
      }
    }
  });

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
  }

  window.addEventListener("beforeunload", () => {
    if (state.stream) {
      for (const track of state.stream.getTracks()) {
        track.stop();
      }
    }
  });
}

function initUI() {
  bindControls(state, elements, () => {
    state.dirty = true;
  });

  elements.settingsBtn.addEventListener("click", () => {
    const shouldOpen = elements.settingsPanel.hidden;
    elements.settingsPanel.hidden = !shouldOpen;
    elements.settingsBtn.setAttribute("aria-expanded", String(shouldOpen));
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.settingsPanel.hidden) {
      elements.settingsPanel.hidden = true;
      elements.settingsBtn.setAttribute("aria-expanded", "false");
    }
  });

  elements.captureBtn.addEventListener("click", () => {
    if (!state.running || !state.hasRenderedFrame) {
      setStatus("No frame available yet", true);
      return;
    }

    try {
      downloadPngFromCanvas(elements.asciiCanvas);
      setStatus("PNG saved");
      setTimeout(() => {
        if (state.running) {
          setStatus("Live");
        }
      }, 1200);
    } catch (_err) {
      setStatus("PNG export failed", true);
    }
  });
}

function bootstrap() {
  resizeOutputCanvas();

  outputCtx.fillStyle = "#04060c";
  outputCtx.fillRect(0, 0, elements.asciiCanvas.width, elements.asciiCanvas.height);
  setStatus("Ready");

  initUI();
  initLifecycle();
  void startCamera();
}

bootstrap();
