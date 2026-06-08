import { applyFaceRetouchIfAvailable } from "./faceRetouch";

export const LIFE4CUT_FILTER_ENABLED = true;
export const PHOTOISM_FILTER_STRENGTH = 0.8;
export const SELECTED_PHOTOISM_PRESET = "cleanWhite";

export const PHOTOISM_PRESETS = {
  cleanWhite: {
    brightness: 1.12,
    contrast: 1.03,
    saturation: 1.06,
    red: 1.02,
    green: 1.02,
    blue: 1.05,
  },
  softPink: {
    brightness: 1.13,
    contrast: 1.01,
    saturation: 1.08,
    red: 1.05,
    green: 1.02,
    blue: 1.04,
  },
  warmStudio: {
    brightness: 1.1,
    contrast: 1.04,
    saturation: 1.07,
    red: 1.04,
    green: 1.025,
    blue: 1.01,
  },
  neutralId: {
    brightness: 1.09,
    contrast: 1.05,
    saturation: 1.03,
    red: 1.02,
    green: 1.02,
    blue: 1.03,
  },
};

const clampChannel = (value) => Math.max(0, Math.min(255, value));
const mix = (from, to, amount) => from + (to - from) * amount;

const getSelectedPreset = () => PHOTOISM_PRESETS[SELECTED_PHOTOISM_PRESET] || PHOTOISM_PRESETS.cleanWhite;

const applyStudioTone = (canvas, strength, preset) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  const brightness = mix(1, preset.brightness, strength);
  const contrast = mix(1, preset.contrast, strength);
  const saturation = mix(1, preset.saturation, strength);
  const red = mix(1, preset.red, strength);
  const green = mix(1, preset.green, strength);
  const blue = mix(1, preset.blue, strength);
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

    r = r * (red + highlightAmount) + shadowAmount;
    g = g * (green + highlightAmount) + shadowAmount;
    b = b * (blue + highlightAmount) + shadowAmount;

    data[i] = clampChannel(r);
    data[i + 1] = clampChannel(g);
    data[i + 2] = clampChannel(b);
  }

  ctx.putImageData(imageData, 0, 0);
};

const applyStudioLight = (canvas, strength, faceBox) => {
  const ctx = canvas.getContext("2d");
  const centerX = faceBox ? faceBox.originX + faceBox.width / 2 : canvas.width / 2;
  const centerY = faceBox ? faceBox.originY + faceBox.height * 0.42 : canvas.height * 0.42;
  const radius = Math.max(canvas.width, canvas.height) * 0.72;
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.14 * strength})`);
  gradient.addColorStop(0.52, `rgba(255, 255, 255, ${0.045 * strength})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const topLight = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.48);
  topLight.addColorStop(0, `rgba(255, 255, 255, ${0.08 * strength})`);
  topLight.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = topLight;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.52);
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

const applyFinePaperTexture = (canvas, strength) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const textureStrength = 2.4 * strength;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const grain = (((x * 17 + y * 31) % 13) - 6) * textureStrength * 0.12;

      data[index] = clampChannel(data[index] + grain);
      data[index + 1] = clampChannel(data[index + 1] + grain);
      data[index + 2] = clampChannel(data[index + 2] + grain);
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

export const applyLife4CutFilter = async (sourceCanvas) => {
  const filteredCanvas = document.createElement("canvas");
  filteredCanvas.width = sourceCanvas.width;
  filteredCanvas.height = sourceCanvas.height;

  const filteredCtx = filteredCanvas.getContext("2d");
  filteredCtx.drawImage(sourceCanvas, 0, 0);

  if (!LIFE4CUT_FILTER_ENABLED) {
    return filteredCanvas;
  }

  const strength = Math.max(0, Math.min(1, PHOTOISM_FILTER_STRENGTH));
  const selectedPreset = getSelectedPreset();

  applyStudioTone(filteredCanvas, strength, selectedPreset);
  const faceBox = await applyFaceRetouchIfAvailable(filteredCanvas, strength);
  applyStudioLight(filteredCanvas, strength, faceBox);
  applyMildSharpen(filteredCanvas, strength);
  applyFinePaperTexture(filteredCanvas, strength);

  return filteredCanvas;
};
