export const FACE_SKIN_SMOOTHING_STRENGTH = 0.22;
export const FACE_MASK_FEATHER = 18;

const VISION_WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

let detector = null;
let detectorPromise = null;
let hasWarnedLoadFailure = false;
let hasWarnedDetectFailure = false;

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

  if (type === "load") hasWarnedLoadFailure = true;
  if (type === "detect") hasWarnedDetectFailure = true;

  console.warn(message, error);
};

export const initializeFaceRetouch = () => {
  if (detector || detectorPromise || !canInitializeMediaPipe()) {
    return detectorPromise;
  }

  detectorPromise = import("@mediapipe/tasks-vision")
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
    .map((detection) => detection.boundingBox)
    .filter(Boolean)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
};

const createFaceMask = (canvas, boundingBox) => {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskCtx = maskCanvas.getContext("2d");

  const centerX = boundingBox.originX + boundingBox.width / 2;
  const centerY = boundingBox.originY + boundingBox.height * 0.47;
  const radiusX = boundingBox.width * 0.5;
  const radiusY = boundingBox.height * 0.62;
  const feather = Math.max(FACE_MASK_FEATHER, Math.min(radiusX, radiusY) * 0.2);

  const gradient = maskCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(radiusX, radiusY) + feather);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.56, "rgba(255, 255, 255, 0.94)");
  gradient.addColorStop(0.78, "rgba(255, 255, 255, 0.42)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  maskCtx.save();
  maskCtx.translate(centerX, centerY);
  maskCtx.scale(radiusX / Math.max(radiusX, radiusY), radiusY / Math.max(radiusX, radiusY));
  maskCtx.fillStyle = gradient;
  maskCtx.beginPath();
  maskCtx.arc(0, 0, Math.max(radiusX, radiusY) + feather, 0, Math.PI * 2);
  maskCtx.fill();
  maskCtx.restore();

  return maskCanvas;
};

const applyMaskedSoftSkin = (canvas, boundingBox) => {
  const ctx = canvas.getContext("2d");
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = canvas.width;
  blurCanvas.height = canvas.height;
  const blurCtx = blurCanvas.getContext("2d");

  blurCtx.filter = "blur(6px)";
  blurCtx.drawImage(canvas, 0, 0);

  const maskCanvas = createFaceMask(canvas, boundingBox);
  blurCtx.globalCompositeOperation = "destination-in";
  blurCtx.drawImage(maskCanvas, 0, 0);

  ctx.save();
  ctx.globalAlpha = FACE_SKIN_SMOOTHING_STRENGTH;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(blurCanvas, 0, 0);
  ctx.restore();
};

export const applyFaceRetouchIfAvailable = async (canvas) => {
  try {
    const faceDetector = detector || (await initializeFaceRetouch());
    if (!faceDetector) return false;

    const result = faceDetector.detect(canvas);
    const boundingBox = getPrimaryFaceBox(result?.detections);
    if (!boundingBox) return false;

    applyMaskedSoftSkin(canvas, boundingBox);
    return true;
  } catch (error) {
    warnOnce("detect", "MediaPipe face retouch failed. Using base Photoism filter only.", error);
    return false;
  }
};
