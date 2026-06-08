export const LIFE4CUT_FILTER_ENABLED = true;

const clampChannel = (value) => Math.max(0, Math.min(255, value));

const applyToneAdjustments = (canvas) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  const brightness = 1.1;
  const contrast = 0.94;
  const saturation = 1.15;

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

    data[i] = clampChannel(r + 7);
    data[i + 1] = clampChannel(g + 3);
    data[i + 2] = clampChannel(b + 5);
  }

  ctx.putImageData(imageData, 0, 0);
};

const applySoftGlow = (canvas, sourceCanvas) => {
  const ctx = canvas.getContext("2d");
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = sourceCanvas.width;
  glowCanvas.height = sourceCanvas.height;

  const glowCtx = glowCanvas.getContext("2d");
  glowCtx.drawImage(sourceCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.globalCompositeOperation = "screen";
  ctx.filter = "blur(8px)";
  ctx.drawImage(glowCanvas, 0, 0);
  ctx.restore();
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

  applyToneAdjustments(filteredCanvas);
  applySoftGlow(filteredCanvas, sourceCanvas);

  return filteredCanvas;
};
