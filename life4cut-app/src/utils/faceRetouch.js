export const FACE_SKIN_SMOOTHING_STRENGTH = 0.12;
export const FACE_MASK_FEATHER = 18;
const TARGET_FACE_LUMINANCE = 178;
const FACE_BRIGHTNESS_BOOST_MAX = 1.06;
const FACE_DEBUG_MODE = false;

const VISION_WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const VISION_MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm";
const FACE_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

let detector = null;
let detectorPromise = null;
let hasWarnedLoadFailure = false;
let hasWarnedDetectFailure = false;
let hasWarnedInvalidFace = false;

const canInitializeMediaPipe = () => {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function" &&
    !navigator.userAgent.includes("jsdom")
  );
};

const warnOnce = (type, message, error) => {
  if (type === "load" && hasWarnedLoadFailure) return;
  if (type === "detect" && hasWarnedDetectFailure) return;
  if (type === "invalid" && hasWarnedInvalidFace) return;

  if (type === "load") hasWarnedLoadFailure = true;
  if (type === "detect") hasWarnedDetectFailure = true;
  if (type === "invalid") hasWarnedInvalidFace = true;

  console.warn(message, error);
};

const loadMediaPipeTasks = () => {
  return import(/* webpackIgnore: true */ VISION_MODULE_URL);
};

export const initializeFaceRetouch = () => {
  if (detector || detectorPromise || !canInitializeMediaPipe()) {
    return detectorPromise;
  }

  detectorPromise = loadMediaPipeTasks()
    .then(({ FaceDetector, FilesetResolver }) => FilesetResolver.forVisionTasks(VISION_WASM_BASE_URL)
      .then((vision) => FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_DETECTOR_MODEL_URL,
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.45,
      })))
    .then((faceDetector) => {
      detector = faceDetector;
      return detector;
    })
    .catch((error) => {
      detectorPromise = null;
      warnOnce("load", "MediaPipe face detector failed to load. Using base Photoism filter only.", error);
      return null;
    });

  return detectorPromise;
};

initializeFaceRetouch();

const getPrimaryFaceBox = (detections = []) => {
  return detections
    .filter((detection) => detection.boundingBox)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
};

const clampBoxToCanvas = (box, canvas) => {
  const originX = Math.max(0, Math.floor(box.originX));
  const originY = Math.max(0, Math.floor(box.originY));
  const width = Math.max(1, Math.min(canvas.width - originX, Math.ceil(box.width)));
  const height = Math.max(1, Math.min(canvas.height - originY, Math.ceil(box.height)));

  return { originX, originY, width, height };
};

const isValidFaceDetection = (detection, canvas) => {
  if (!detection?.boundingBox) return false;

  const box = clampBoxToCanvas(detection.boundingBox, canvas);
  const centerX = box.originX + box.width / 2;
  const centerY = box.originY + box.height / 2;
  const minWidth = canvas.width * 0.15;
  const minHeight = canvas.height * 0.15;
  const maxWidth = canvas.width * 0.8;
  const maxHeight = canvas.height * 0.8;

  return (
    box.width >= minWidth &&
    box.height >= minHeight &&
    box.width <= maxWidth &&
    box.height <= maxHeight &&
    centerX >= 0 &&
    centerX <= canvas.width &&
    centerY >= 0 &&
    centerY <= canvas.height
  );
};

const keypointToCanvasPoint = (keypoint, canvas) => ({
  x: keypoint.x * canvas.width,
  y: keypoint.y * canvas.height,
});

const getDetailKeypoints = (detection, canvas) => {
  const points = (detection.keypoints || []).map((keypoint) => keypointToCanvasPoint(keypoint, canvas));
  if (points.length < 2) return { eyes: [], mouth: null };

  const eyes = [...points].sort((a, b) => a.y - b.y).slice(0, 2);
  const mouth = [...points].sort((a, b) => b.y - a.y)[0];

  return { eyes, mouth };
};

const drawSoftExclusion = (ctx, x, y, radiusX, radiusY) => {
  const radius = Math.max(radiusX, radiusY);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.8)");
  gradient.addColorStop(0.58, "rgba(0, 0, 0, 0.38)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(radiusX / radius, radiusY / radius);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const createFaceMask = (canvas, boundingBox, detection) => {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskCtx = maskCanvas.getContext("2d");
  const faceBox = clampBoxToCanvas(boundingBox, canvas);

  const centerX = faceBox.originX + faceBox.width / 2;
  const centerY = faceBox.originY + faceBox.height * 0.47;
  const radiusX = faceBox.width * 0.41;
  const radiusY = faceBox.height * 0.45;
  const feather = Math.max(FACE_MASK_FEATHER, Math.min(radiusX, radiusY) * 0.2);

  maskCtx.save();
  maskCtx.filter = `blur(${feather}px)`;
  maskCtx.translate(centerX, centerY);
  maskCtx.fillStyle = "rgba(255, 255, 255, 0.96)";
  maskCtx.beginPath();
  maskCtx.ellipse(0, 0, Math.max(1, radiusX - feather * 0.45), Math.max(1, radiusY - feather * 0.45), 0, 0, Math.PI * 2);
  maskCtx.fill();
  maskCtx.restore();

  const { eyes, mouth } = getDetailKeypoints(detection, canvas);
  maskCtx.globalCompositeOperation = "destination-out";
  eyes.forEach((eye) => {
    drawSoftExclusion(maskCtx, eye.x, eye.y, faceBox.width * 0.16, faceBox.height * 0.09);
  });

  if (mouth) {
    drawSoftExclusion(maskCtx, mouth.x, mouth.y, faceBox.width * 0.18, faceBox.height * 0.1);
  }
  maskCtx.globalCompositeOperation = "source-over";

  return maskCanvas;
};

const getFaceAverageLuminance = (canvas, boundingBox) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const faceBox = clampBoxToCanvas(boundingBox, canvas);
  const imageData = ctx.getImageData(faceBox.originX, faceBox.originY, faceBox.width, faceBox.height);
  const { data } = imageData;
  const centerX = faceBox.width / 2;
  const centerY = faceBox.height * 0.47;
  const radiusX = faceBox.width * 0.45;
  const radiusY = faceBox.height * 0.55;
  let total = 0;
  let count = 0;

  for (let y = 0; y < faceBox.height; y += 4) {
    for (let x = 0; x < faceBox.width; x += 4) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      if (normalizedX * normalizedX + normalizedY * normalizedY > 1) continue;

      const index = (y * faceBox.width + x) * 4;
      total += data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      count += 1;
    }
  }

  return count ? total / count : TARGET_FACE_LUMINANCE;
};

const applyFaceExposure = (canvas, boundingBox, maskCanvas, strength) => {
  const averageLuminance = getFaceAverageLuminance(canvas, boundingBox);
  if (averageLuminance >= TARGET_FACE_LUMINANCE) return;

  const calculatedBoost = 1 + ((TARGET_FACE_LUMINANCE - averageLuminance) / TARGET_FACE_LUMINANCE) * 0.18 * strength;
  const exposureBoost = Math.min(calculatedBoost, FACE_BRIGHTNESS_BOOST_MAX);
  const lift = exposureBoost - 1;
  const exposureCanvas = document.createElement("canvas");
  exposureCanvas.width = canvas.width;
  exposureCanvas.height = canvas.height;
  const exposureCtx = exposureCanvas.getContext("2d", { willReadFrequently: true });

  exposureCtx.drawImage(canvas, 0, 0);
  const imageData = exposureCtx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] * exposureBoost + lift * 8);
    data[i + 1] = Math.min(255, data[i + 1] * exposureBoost + lift * 8);
    data[i + 2] = Math.min(255, data[i + 2] * exposureBoost + lift * 9);
  }

  exposureCtx.putImageData(imageData, 0, 0);
  exposureCtx.globalCompositeOperation = "destination-in";
  exposureCtx.drawImage(maskCanvas, 0, 0);

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.drawImage(exposureCanvas, 0, 0);
  ctx.restore();

  if (FACE_DEBUG_MODE) {
    console.log("face brightness", averageLuminance, "boost", exposureBoost);
  }
};

const applyMaskedSoftSkin = (canvas, maskCanvas) => {
  const ctx = canvas.getContext("2d");
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = canvas.width;
  blurCanvas.height = canvas.height;
  const blurCtx = blurCanvas.getContext("2d");

  blurCtx.filter = "blur(6px)";
  blurCtx.drawImage(canvas, 0, 0);

  blurCtx.globalCompositeOperation = "destination-in";
  blurCtx.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = FACE_SKIN_SMOOTHING_STRENGTH;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(blurCanvas, 0, 0);
  ctx.restore();
};

export const applyFaceRetouchIfAvailable = async (canvas, strength = 1) => {
  try {
    const faceDetector = detector || (await initializeFaceRetouch());
    if (!faceDetector) return null;

    const result = faceDetector.detect(canvas);
    const detection = getPrimaryFaceBox(result?.detections);
    if (!isValidFaceDetection(detection, canvas)) {
      warnOnce("invalid", "MediaPipe face retouch skipped. Invalid or missing face box.");
      return null;
    }

    if (FACE_DEBUG_MODE) {
      console.log("face box", detection.boundingBox, "confidence", detection.categories?.[0]?.score);
    }

    const maskCanvas = createFaceMask(canvas, detection.boundingBox, detection);
    applyFaceExposure(canvas, detection.boundingBox, maskCanvas, strength);
    applyMaskedSoftSkin(canvas, maskCanvas);

    if (FACE_DEBUG_MODE) {
      const ctx = canvas.getContext("2d");
      const box = clampBoxToCanvas(detection.boundingBox, canvas);
      ctx.save();
      ctx.strokeStyle = "rgba(0, 160, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(box.originX, box.originY, box.width, box.height);
      ctx.restore();
    }

    return clampBoxToCanvas(detection.boundingBox, canvas);
  } catch (error) {
    warnOnce("detect", "MediaPipe face retouch failed. Using base Photoism filter only.", error);
    return null;
  }
};
