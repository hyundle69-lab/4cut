export const LIFE4CUT_FILTER_ENABLED = true;
export const PHOTOISM_FILTER_STRENGTH = 0.78;
export const DEFAULT_PHOTOISM_FILTER = "signature";

const MAX_EXPOSURE = 1.16;

export const PHOTOISM_FILTERS = {
  pure: {
    label: "PURE",
    exposure: 1.1,
    targetLuminance: 162,
    warm: 0.045,
    contrast: 1.035,
    saturation: 0.96,
    blackPoint: 5.5,
    highlightSoftening: 0.28,
    sharpness: 0.07,
    grain: 0.008,
    glow: 0.045,
    light: 0.065,
    monochrome: 0,
  },
  signature: {
    label: "SIGNATURE",
    exposure: 1.08,
    targetLuminance: 158,
    warm: 0.06,
    contrast: 1.06,
    saturation: 0.94,
    blackPoint: 7.5,
    highlightSoftening: 0.34,
    sharpness: 0.09,
    grain: 0.01,
    glow: 0.055,
    light: 0.075,
    monochrome: 0,
  },
  film: {
    label: "FILM",
    exposure: 1.05,
    targetLuminance: 150,
    warm: 0.085,
    contrast: 1.08,
    saturation: 0.9,
    blackPoint: 9,
    highlightSoftening: 0.26,
    sharpness: 0.06,
    grain: 0.024,
    glow: 0.035,
    light: 0.055,
    monochrome: 0,
  },
  mono: {
    label: "MONO",
    exposure: 1.07,
    targetLuminance: 154,
    warm: 0,
    contrast: 1.11,
    saturation: 0,
    blackPoint: 10,
    highlightSoftening: 0.3,
    sharpness: 0.08,
    grain: 0.014,
    glow: 0.03,
    light: 0.06,
    monochrome: 1,
  },
};

const clampChannel = (value) => Math.max(0, Math.min(255, value));
const clampUnit = (value) => Math.max(0, Math.min(1, value));
const mix = (from, to, amount) => from + (to - from) * amount;
const getFilterPreset = (filterId) => PHOTOISM_FILTERS[filterId] || PHOTOISM_FILTERS[DEFAULT_PHOTOISM_FILTER];

const seededNoise = (x, y, salt = 0) => {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
};

const getImageStats = (data, width, height) => {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 120));
  let sampleCount = 0;
  let luminanceTotal = 0;
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

      if (luminance > 10 && luminance < 246) {
        redTotal += r;
        greenTotal += g;
        blueTotal += b;
        luminanceTotal += luminance;
        sampleCount += 1;
      }
    }
  }

  if (!sampleCount) {
    return {
      luminance: 128,
      red: 128,
      green: 128,
      blue: 128,
    };
  }

  return {
    luminance: luminanceTotal / sampleCount,
    red: redTotal / sampleCount,
    green: greenTotal / sampleCount,
    blue: blueTotal / sampleCount,
  };
};

const getWhiteBalanceMultipliers = (stats, strength) => {
  const gray = (stats.red + stats.green + stats.blue) / 3;
  const limit = 0.075 * strength;
  const balance = (channel) => {
    const correction = gray / Math.max(1, channel);
    return Math.max(1 - limit, Math.min(1 + limit, mix(1, correction, 0.5 * strength)));
  };

  return {
    red: balance(stats.red),
    green: balance(stats.green),
    blue: balance(stats.blue),
  };
};

const applyPremiumTone = (canvas, strength, preset) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const stats = getImageStats(data, canvas.width, canvas.height);
  const autoExposure = Math.min(MAX_EXPOSURE, preset.targetLuminance / Math.max(84, stats.luminance));
  const exposure = Math.min(MAX_EXPOSURE, mix(1, preset.exposure * autoExposure, 0.42 * strength));
  const whiteBalance = getWhiteBalanceMultipliers(stats, strength);
  const contrast = mix(1, preset.contrast, strength);
  const saturation = mix(1, preset.saturation, strength);
  const warmRed = 1 + preset.warm * strength;
  const warmGreen = 1 + preset.warm * 0.36 * strength;
  const warmBlue = 1 - preset.warm * 0.32 * strength;
  const blackPoint = preset.blackPoint * strength;
  const highlightSoftening = preset.highlightSoftening * strength;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * exposure;
    let g = data[i + 1] * exposure;
    let b = data[i + 2] * exposure;

    r *= whiteBalance.red;
    g *= whiteBalance.green;
    b *= whiteBalance.blue;

    r *= warmRed;
    g *= warmGreen;
    b *= warmBlue;

    let luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const highlightMask = clampUnit((luminance - 178) / 77);
    if (highlightMask > 0) {
      const softenedLuminance = 178 + (luminance - 178) * (1 - highlightSoftening * highlightMask);
      const luminanceScale = softenedLuminance / Math.max(1, luminance);
      r *= luminanceScale;
      g *= luminanceScale;
      b *= luminanceScale;
      luminance = softenedLuminance;
    }

    const shadowMask = Math.pow(1 - clampUnit(luminance / 255), 1.25);
    r -= blackPoint * shadowMask;
    g -= blackPoint * shadowMask;
    b -= blackPoint * shadowMask;

    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    r = luminance + (r - luminance) * saturation;
    g = luminance + (g - luminance) * saturation;
    b = luminance + (b - luminance) * saturation;

    if (preset.monochrome) {
      const mono = 0.32 * r + 0.56 * g + 0.12 * b;
      r = mix(r, mono, preset.monochrome);
      g = mix(g, mono, preset.monochrome);
      b = mix(b, mono, preset.monochrome);
    }

    data[i] = clampChannel(r);
    data[i + 1] = clampChannel(g);
    data[i + 2] = clampChannel(b);
  }

  ctx.putImageData(imageData, 0, 0);
};

const applyHighlightSoftGlow = (canvas, strength, preset) => {
  const ctx = canvas.getContext("2d");
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = canvas.width;
  glowCanvas.height = canvas.height;
  const glowCtx = glowCanvas.getContext("2d");

  glowCtx.filter = "blur(4px) brightness(1.04)";
  glowCtx.drawImage(canvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = Math.min(0.075, preset.glow * strength);
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(glowCanvas, 0, 0);
  ctx.restore();
};

export const applyBoothRingLight = (canvas, strength = 1, lightOpacity = 0.075) => {
  const ctx = canvas.getContext("2d");
  const centerX = canvas.width / 2;
  const centerY = canvas.height * 0.42;
  const radius = Math.max(canvas.width, canvas.height) * 0.78;
  const opacity = Math.min(0.095, lightOpacity * strength);
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);

  gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
  gradient.addColorStop(0.33, `rgba(255, 255, 255, ${opacity * 0.82})`);
  gradient.addColorStop(0.68, `rgba(255, 247, 235, ${opacity * 0.22})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
};

const applyMildSharpen = (canvas, amount) => {
  if (amount <= 0) return;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const output = ctx.createImageData(source);
  const { width, height } = canvas;

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

        output.data[index + channel] = clampChannel(center + edge * amount);
      }
    }
  }

  ctx.putImageData(output, 0, 0);
};

const applyGrain = (canvas, opacity) => {
  if (opacity <= 0) return;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const grain = (seededNoise(x, y, 3) - 0.5) * 255 * opacity;

      data[index] = clampChannel(data[index] + grain);
      data[index + 1] = clampChannel(data[index + 1] + grain);
      data[index + 2] = clampChannel(data[index + 2] + grain);
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

export const applyFinalPrintFinish = (canvas) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxDistance = Math.hypot(centerX, centerY);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const paper = (seededNoise(Math.floor(x / 2), Math.floor(y / 2), 11) - 0.5) * 4.2;
      const fineGrain = (seededNoise(x, y, 17) - 0.5) * 3.4;
      const distance = Math.hypot(x - centerX, y - centerY) / maxDistance;
      const depth = 1 - Math.max(0, distance - 0.44) * 0.052;
      const texture = paper + fineGrain;

      data[index] = clampChannel((data[index] + texture) * depth);
      data[index + 1] = clampChannel((data[index + 1] + texture) * depth);
      data[index + 2] = clampChannel((data[index + 2] + texture) * depth);
    }
  }

  ctx.putImageData(imageData, 0, 0);
};

export const applyLife4CutFilter = (sourceCanvas, filterId = DEFAULT_PHOTOISM_FILTER) => {
  const filteredCanvas = document.createElement("canvas");
  filteredCanvas.width = sourceCanvas.width;
  filteredCanvas.height = sourceCanvas.height;

  const filteredCtx = filteredCanvas.getContext("2d");
  filteredCtx.drawImage(sourceCanvas, 0, 0);

  if (!LIFE4CUT_FILTER_ENABLED) {
    return filteredCanvas;
  }

  const strength = Math.max(0, Math.min(1, PHOTOISM_FILTER_STRENGTH));
  const preset = getFilterPreset(filterId);

  applyPremiumTone(filteredCanvas, strength, preset);
  applyHighlightSoftGlow(filteredCanvas, strength, preset);
  applyMildSharpen(filteredCanvas, preset.sharpness * strength);
  applyGrain(filteredCanvas, preset.grain * strength);

  return filteredCanvas;
};
