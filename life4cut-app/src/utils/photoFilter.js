export const LIFE4CUT_FILTER_ENABLED = true;
export const PHOTOISM_FILTER_STRENGTH = 0.8;

const clampChannel = (value) => Math.max(0, Math.min(255, value));
const mix = (from, to, amount) => from + (to - from) * amount;

const applyStudioTone = (canvas, strength) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  const brightness = mix(1, 1.12, strength);
  const contrast = mix(1, 1.03, strength);
  const saturation = mix(1, 1.08, strength);
  const highlightLift = 0.05 * strength;
  const shadowLift = 7.65 * strength;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    r *= brightness;
    g *= brightness;
    b *= brightness;

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    r = luminance + (r - luminance) * saturation;
    g = luminance + (g - luminance) * saturation;
    b = luminance + (b - luminance) * saturation;

    const normalizedLight = Math.max(0, Math.min(1, luminance / 255));
    const highlightAmount = normalizedLight * highlightLift;
    const shadowAmount = (1 - normalizedLight) * shadowLift;

    r = r * (1 + 0.03 * strength + highlightAmount) + shadowAmount;
    g = g * (1 + 0.02 * strength + highlightAmount) + shadowAmount;
    b = b * (1 + 0.04 * strength + highlightAmount) + shadowAmount;

    data[i] = clampChannel(r);
    data[i + 1] = clampChannel(g);
    data[i + 2] = clampChannel(b);
  }

  ctx.putImageData(imageData, 0, 0);
};

const applySoftSkin = (canvas, strength) => {
  const ctx = canvas.getContext("2d");
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = canvas.width;
  glowCanvas.height = canvas.height;

  const glowCtx = glowCanvas.getContext("2d");
  glowCtx.filter = "blur(6px)";
  glowCtx.drawImage(canvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = mix(0, 0.18, strength);
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(glowCanvas, 0, 0);
  ctx.restore();
};

const applyStudioLight = (canvas, strength) => {
  const ctx = canvas.getContext("2d");
  const centerX = canvas.width / 2;
  const centerY = canvas.height * 0.42;
  const radius = Math.max(canvas.width, canvas.height) * 0.72;
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.12 * strength})`);
  gradient.addColorStop(0.52, `rgba(255, 255, 255, ${0.045 * strength})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
};

const applyMildSharpen = (canvas, strength) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const output = ctx.createImageData(source);
  const { width, height } = canvas;
  const sharpenStrength = 0.15 * strength;

  output.data.set(source.data);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const center = source.data[index + channel];
        const top = source.data[index - width * 4 + channel];
        const right = source.data[index + 4 + channel];
        const bottom = source.data[index + width * 4 + channel];
        const left = source.data[index - 4 + channel];
        const edge = center * 4 - top - right - bottom - left;

        output.data[index + channel] = clampChannel(center + edge * sharpenStrength);
      }
    }
  }

  ctx.putImageData(output, 0, 0);
};

export const applyLife4CutFilter = (sourceCanvas) => {
  const filteredCanvas = document.createElement("canvas");
  filteredCanvas.width = sourceCanvas.width;
  filteredCanvas.height = sourceCanvas.height;

  const filteredCtx = filteredCanvas.getContext("2d");
  filteredCtx.drawImage(sourceCanvas, 0, 0);

  if (!LIFE4CUT_FILTER_ENABLED) {
    return filteredCanvas;
  }

  const strength = Math.max(0, Math.min(1, PHOTOISM_FILTER_STRENGTH));

  applyStudioTone(filteredCanvas, strength);
  applySoftSkin(filteredCanvas, strength);
  applyStudioLight(filteredCanvas, strength);
  applyMildSharpen(filteredCanvas, strength);

  return filteredCanvas;
};
