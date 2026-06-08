import React, { useCallback, useEffect, useState, useRef } from "react";
import "./App.css";
import { applyLife4CutFilter } from "./utils/photoFilter";

const PHOTO_COUNT = 4;
const CAPTURE_SIZE = 600;
// iPad front cameras can feel too wide; lower to 1.25 if faces are cropped too tightly.
const CAMERA_ZOOM_FACTOR = 1.35;
const FRAME_WIDTH = 600;
const FRAME_HEIGHT = 2400;
const PHOTO_SIDE = 560;
const PHOTO_PADDING = (FRAME_WIDTH - PHOTO_SIDE) / 2;
const PHOTO_Y_POSITIONS = [133, 688, 1231, 1785];
let hasLoggedCameraDebug = false;

const drawBlackFrame = (ctx) => {
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  PHOTO_Y_POSITIONS.forEach((y) => {
    ctx.rect(PHOTO_PADDING, y, PHOTO_SIDE, PHOTO_SIDE);
  });
  ctx.fill("evenodd");
  ctx.fillStyle = "#fff";
  ctx.font = "700 34px Courier New, monospace";
  ctx.textAlign = "center";
  ctx.fillText("My 4 Cut", FRAME_WIDTH / 2, 78);
  ctx.font = "24px Courier New, monospace";
  ctx.fillText(new Date().toLocaleDateString(), FRAME_WIDTH / 2, 2350);
  ctx.restore();
};

const frames = [
  {
    id: "black",
    name: "Black",
    draw: drawBlackFrame,
  },
];

const drawZoomedVideoToCanvas = (video, canvas) => {
  const ctx = canvas.getContext("2d");

  canvas.width = CAPTURE_SIZE;
  canvas.height = CAPTURE_SIZE;

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  if (!videoWidth || !videoHeight) {
    throw new Error("Video metadata is not ready");
  }

  if (!hasLoggedCameraDebug) {
    console.log("camera video size", videoWidth, videoHeight);
    console.log("camera zoom factor", CAMERA_ZOOM_FACTOR);
    hasLoggedCameraDebug = true;
  }

  const baseSize = Math.min(videoWidth, videoHeight);
  const sourceSize = baseSize / CAMERA_ZOOM_FACTOR;
  const sx = (videoWidth - sourceSize) / 2;
  const sy = (videoHeight - sourceSize) / 2;

  ctx.clearRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-CAPTURE_SIZE, 0);
  ctx.drawImage(video, sx, sy, sourceSize, sourceSize, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
  ctx.restore();

  return canvas;
};

const readStoredBoolean = (key, fallback) => {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue === null ? fallback : storedValue === "true";
  } catch (error) {
    return fallback;
  }
};

const writeStoredBoolean = (key, value) => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (error) {
    // localStorage can be unavailable in private browsing modes.
  }
};

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const streamRef = useRef(null);
  const [view, setView] = useState("home");
  const [photos, setPhotos] = useState([]);
  const [mergedImage, setMergedImage] = useState(null);
  const [showSquareCamera, setShowSquareCamera] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [countdownKey, setCountdownKey] = useState(0);
  const [flash, setFlash] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [timerEnabled, setTimerEnabled] = useState(() => readStoredBoolean("life4cut_timer_enabled", true));
  const [flashEnabled, setFlashEnabled] = useState(() => readStoredBoolean("life4cut_flash_enabled", true));
  const [filterEnabled, setFilterEnabled] = useState(() => readStoredBoolean("life4cut_filter_enabled", true));

  const selectedFrame = frames[0];

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("카메라 권한을 허용해주세요.");
      return;
    }

    try {
      setCameraError("");
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
          aspectRatio: { ideal: 1 },
        },
      });

      if (videoRef.current) {
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      } else {
        stream.getTracks?.().forEach((track) => track.stop());
      }
    } catch (error) {
      setCameraError("카메라 권한을 허용해주세요.");
    }
  }, [stopCamera]);

  useEffect(() => {
    if (view !== "capture") {
      stopCamera();
      return undefined;
    }

    startCamera();

    return stopCamera;
  }, [startCamera, stopCamera, view]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    writeStoredBoolean("life4cut_timer_enabled", timerEnabled);
  }, [timerEnabled]);

  useEffect(() => {
    writeStoredBoolean("life4cut_flash_enabled", flashEnabled);
  }, [flashEnabled]);

  useEffect(() => {
    writeStoredBoolean("life4cut_filter_enabled", filterEnabled);
  }, [filterEnabled]);

  const mergePhotos = useCallback((images) => {
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext("2d");

    const loadedImages = new Array(PHOTO_COUNT).fill(null);
    let loadedCount = 0;

    images.forEach((src, index) => {
      const img = new Image();
      img.onload = () => {
        loadedImages[index] = img;
        loadedCount += 1;

        if (loadedCount === PHOTO_COUNT) {
          loadedImages.forEach((loadedImage, i) => {
            if (!loadedImage) return;
            ctx.drawImage(loadedImage, PHOTO_PADDING, PHOTO_Y_POSITIONS[i], PHOTO_SIDE, PHOTO_SIDE);
          });

          selectedFrame.draw(ctx);
          setMergedImage(canvas.toDataURL("image/png"));
        }
      };
      img.src = src;
    });
  }, [selectedFrame]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (!videoWidth || !videoHeight) {
      setCameraError("카메라 화면이 준비된 뒤 촬영해주세요.");
      setShowSquareCamera(false);
      return;
    }

    if (flashEnabled) {
      setFlash(true);
      setTimeout(() => setFlash(false), 190);
    }
    setShowSquareCamera(true);

    drawZoomedVideoToCanvas(video, canvas);

    const filteredCanvas = filterEnabled ? applyLife4CutFilter(canvas) : canvas;
    const imgData = filteredCanvas.toDataURL("image/png");

    setPhotos((currentPhotos) => {
      const newPhotos = [...currentPhotos, imgData];
      if (newPhotos.length === PHOTO_COUNT) {
        mergePhotos(newPhotos);
      }
      return newPhotos;
    });

    setTimeout(() => setShowSquareCamera(false), 220);
  }, [filterEnabled, flashEnabled, mergePhotos]);

  const takePhoto = () => {
    if (photos.length >= PHOTO_COUNT || countdown > 0 || mergedImage) return;

    if (!timerEnabled) {
      capturePhoto();
      return;
    }

    let seconds = 3;
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    setCountdown(seconds);
    setCountdownKey((key) => key + 1);

    countdownTimerRef.current = setInterval(() => {
      seconds -= 1;

      if (seconds > 0) {
        setCountdown(seconds);
        setCountdownKey((key) => key + 1);
        return;
      }

      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
      setCountdown(0);
      capturePhoto();
    }, 1000);
  };

  const clearCaptureState = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setPhotos([]);
    setMergedImage(null);
    setCountdown(0);
    setFlash(false);
    setShowSquareCamera(false);
  };

  const startSession = () => {
    clearCaptureState();
    setCameraError("");
    setView("capture");
  };

  const resetPhotos = () => {
    clearCaptureState();
  };

  const goHome = () => {
    clearCaptureState();
    setView("home");
    stopCamera();
  };

  const downloadImage = (dataUrl, filename = "life4cut.png") => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dataURLtoFile = (dataurl, filename) => {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  };

  const shareImage = async () => {
    if (!mergedImage || !navigator.share) {
      alert("이 브라우저에서는 공유 기능을 지원하지 않습니다.");
      return;
    }

    const file = dataURLtoFile(mergedImage, "life4cut.png");
    const shareData = {
      title: "내 인생네컷",
      text: "인생네컷 완성했어요!",
      files: [file],
    };

    try {
      if (navigator.canShare && !navigator.canShare(shareData)) {
        await navigator.share({ title: shareData.title, text: shareData.text });
        return;
      }
      await navigator.share(shareData);
    } catch (error) {
      if (error.name !== "AbortError") {
        alert("공유를 완료하지 못했습니다.");
      }
    }
  };

  const settingSummary = `Timer ${timerEnabled ? "ON" : "OFF"} · Flash ${flashEnabled ? "ON" : "OFF"} · Beauty ${filterEnabled ? "ON" : "OFF"}`;

  const renderSettingToggle = (label, enabled, onChange) => (
    <button
      type="button"
      className={`booth-toggle ${enabled ? "on" : ""}`}
      onClick={() => onChange((current) => !current)}
      aria-pressed={enabled}
    >
      <span>{label}</span>
      <strong>{enabled ? "ON" : "OFF"}</strong>
    </button>
  );

  return (
    <div className="app app-shell">
      {flash && <div className="flash-overlay" />}

      {countdown > 0 && (
        <div className="countdown-overlay">
          <span key={countdownKey} className="countdown-number">{countdown}</span>
        </div>
      )}

      {view === "home" ? (
        <section className="booth-home">
          <div className="booth-card home-card">
            <p className="booth-kicker">PHOTO BOOTH</p>
            <h1 className="booth-title">Life in Four Cuts</h1>
            <p className="booth-subtitle">Capture your moment</p>

            <div className="booth-preview" aria-hidden="true">
              {[1, 2, 3, 4].map((item) => (
                <span key={item} />
              ))}
            </div>

            <button className="booth-main-button" onClick={startSession}>START PHOTO SESSION</button>

            <div className="booth-setting-row" aria-label="촬영 설정">
              {renderSettingToggle("Timer", timerEnabled, setTimerEnabled)}
              {renderSettingToggle("Flash", flashEnabled, setFlashEnabled)}
              {renderSettingToggle("Beauty Filter", filterEnabled, setFilterEnabled)}
            </div>
          </div>
        </section>
      ) : mergedImage ? (
        <section className="result-stage result-view">
          <h2>Your Moment is Ready</h2>
          <div className="result-preview-card">
            <img className="result-image" src={mergedImage} alt="네컷" />
          </div>
          <div className="result-actions">
            <button className="button gray" onClick={resetPhotos}>RETAKE</button>
            <button className="button accent" onClick={() => downloadImage(mergedImage)}>SAVE</button>
            <button className="button primary" onClick={shareImage}>SHARE</button>
            <button className="button soft" onClick={goHome}>HOME</button>
          </div>
        </section>
      ) : (
        <section className="camera-stage booth-view">
          <div className="capture-header">
            <div className="capture-progress">{String(Math.min(photos.length + 1, PHOTO_COUNT)).padStart(2, "0")} / 04</div>
            <p>{settingSummary}</p>
          </div>

          <div className="camera-preview-card">
            <div className="camera-wrap">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                width="320"
                height="320"
                className="camera-video"
                style={{ "--camera-zoom": CAMERA_ZOOM_FACTOR }}
              />
              <div className="face-guide" />
              {showSquareCamera && <div className="capture-outline" />}
            </div>
          </div>

          {cameraError && <p role="alert" className="camera-error">{cameraError}</p>}

          <canvas ref={canvasRef} width={CAPTURE_SIZE} height={CAPTURE_SIZE} style={{ display: "none" }} />

          <div className="capture-thumbnails thumbnail-strip" aria-label="촬영된 사진">
            {Array.from({ length: PHOTO_COUNT }).map((_, index) => (
              <div className={`thumbnail-slot ${photos[index] ? "filled" : ""}`} key={index}>
                {photos[index] ? <img src={photos[index]} alt={`${index + 1}번째 사진`} /> : <span>{index + 1}</span>}
              </div>
            ))}
          </div>

          <div className="controls">
            <button className="button accent capture-button" onClick={takePhoto} disabled={photos.length >= PHOTO_COUNT || countdown > 0}>
              <span className="shutter-icon" aria-hidden="true" />
              <span className="capture-label">CAPTURE</span>
            </button>
            <button className="button gray" onClick={resetPhotos}>RESTART</button>
            <button className="button soft" onClick={goHome}>HOME</button>
          </div>
        </section>
      )}
    </div>
  );
}
