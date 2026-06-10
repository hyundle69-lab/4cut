import React, { useCallback, useEffect, useState, useRef } from "react";
import "./App.css";
import {
  DEFAULT_PHOTOISM_FILTER,
  PHOTOISM_FILTERS,
  applyBoothRingLight,
  applyFinalPrintFinish,
  applyLife4CutFilter,
} from "./utils/photoFilter";

const PHOTO_COUNT = 4;
const CAPTURE_SIZE = 600;
// iPad front cameras can feel too wide; lower to 1.25 if faces are cropped too tightly.
const CAMERA_ZOOM_FACTOR = 1.35;
const FRAME_WIDTH = 600;
const FRAME_HEIGHT = 2400;
const PHOTO_SIDE = 560;
const PHOTO_PADDING = (FRAME_WIDTH - PHOTO_SIDE) / 2;
const PHOTO_STRIP_Y = 120;
const PHOTO_STRIP_HEIGHT = 2240;
const PHOTO_GAP = 16;
const PHOTO_SLOT_HEIGHT = (PHOTO_STRIP_HEIGHT - PHOTO_GAP * (PHOTO_COUNT - 1)) / PHOTO_COUNT;
const PHOTO_SLOTS = Array.from({ length: PHOTO_COUNT }, (_, index) => ({
  x: PHOTO_PADDING,
  y: PHOTO_STRIP_Y + (PHOTO_SLOT_HEIGHT + PHOTO_GAP) * index,
  width: PHOTO_SIDE,
  height: PHOTO_SLOT_HEIGHT,
}));
let hasLoggedCameraDebug = false;

const drawPhotoSlotLines = (ctx, color, alpha = 1) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2;
  PHOTO_SLOTS.forEach((slot) => {
    ctx.strokeRect(slot.x + 1, slot.y + 1, slot.width - 2, slot.height - 2);
  });
  ctx.restore();
};

const drawTrackingText = (ctx, text, x, y, tracking) => {
  const characters = Array.from(text);
  const textWidth = characters.reduce((width, character, index) => (
    width + ctx.measureText(character).width + (index < characters.length - 1 ? tracking : 0)
  ), 0);
  let currentX = x - textWidth / 2;

  characters.forEach((character, index) => {
    ctx.fillText(character, currentX, y);
    currentX += ctx.measureText(character).width + (index < characters.length - 1 ? tracking : 0);
  });
};

const drawImageCover = (ctx, image, x, y, width, height) => {
  const imageRatio = image.width / image.height;
  const slotRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > slotRatio) {
    sourceWidth = image.height * slotRatio;
    sx = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / slotRatio;
    sy = (image.height - sourceHeight) / 2;
  }

  ctx.drawImage(image, sx, sy, sourceWidth, sourceHeight, x, y, width, height);
};

const drawBlackFrame = (ctx) => {
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  PHOTO_SLOTS.forEach((slot) => {
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
  });
  ctx.fill("evenodd");
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.textAlign = "center";
  ctx.font = "400 20px Inter, Arial, sans-serif";
  drawTrackingText(ctx, "MOMENTS", FRAME_WIDTH / 2, 2386, 8);
  ctx.restore();
};

const drawBusinessFrame = (ctx) => {
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  PHOTO_SLOTS.forEach((slot) => {
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
  });
  ctx.fill("evenodd");

  ctx.fillStyle = "#f7f7f3";
  ctx.textAlign = "center";
  ctx.font = "600 34px Inter, Arial, sans-serif";
  drawTrackingText(ctx, "ASCE+", FRAME_WIDTH / 2, 78, 4);
  ctx.restore();
};

const drawSchoolFrame = (ctx) => {
  ctx.save();
  ctx.fillStyle = "#faf9f6";
  ctx.beginPath();
  ctx.rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  PHOTO_SLOTS.forEach((slot) => {
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
  });
  ctx.fill("evenodd");

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  PHOTO_SLOTS.forEach((slot) => {
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
  });
  ctx.clip("evenodd");
  ctx.globalAlpha = 0.1;
  for (let y = 0; y < FRAME_HEIGHT; y += 18) {
    ctx.fillStyle = y % 36 === 0 ? "#ffffff" : "#e9e2d6";
    ctx.fillRect(0, y, FRAME_WIDTH, 1);
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(43, 37, 29, 0.1)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 3;
  drawPhotoSlotLines(ctx, "rgba(34, 31, 27, 0.16)", 0.85);
  ctx.restore();

  ctx.strokeStyle = "rgba(180, 160, 120, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(FRAME_WIDTH * 0.275, 98);
  ctx.lineTo(FRAME_WIDTH * 0.725, 98);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#25211b";
  ctx.font = "500 22px Playfair Display, Cormorant Garamond, Libre Baskerville, Times New Roman, serif";
  drawTrackingText(ctx, "Toyo University", FRAME_WIDTH / 2, 56, 1.2);
  ctx.font = "400 16px Playfair Display, Cormorant Garamond, Libre Baskerville, Times New Roman, serif";
  drawTrackingText(ctx, "Koreans", FRAME_WIDTH / 2, 78, 2);
  ctx.restore();
};

const FRAME_PRESETS = {
  private: {
    label: "Private",
    titleText: "",
    subtitleText: "",
    styleClass: "frame-private",
    borderColor: "#111",
    backgroundColor: "#111",
    draw: drawBlackFrame,
  },
  business: {
    label: "Business",
    titleText: "ASCE+",
    subtitleText: "",
    styleClass: "frame-business",
    borderColor: "#f7f7f3",
    backgroundColor: "#111",
    draw: drawBusinessFrame,
  },
  school: {
    label: "School",
    titleText: "Toyo University Koreans",
    subtitleText: "",
    styleClass: "frame-school",
    borderColor: "#d9dde3",
    backgroundColor: "#faf9f6",
    draw: drawSchoolFrame,
  },
};

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

const readStoredFilter = () => {
  try {
    const storedValue = window.localStorage.getItem("life4cut_filter_preset");
    return PHOTOISM_FILTERS[storedValue] ? storedValue : DEFAULT_PHOTOISM_FILTER;
  } catch (error) {
    return DEFAULT_PHOTOISM_FILTER;
  }
};

const writeStoredFilter = (value) => {
  try {
    window.localStorage.setItem("life4cut_filter_preset", value);
  } catch (error) {
    // localStorage can be unavailable in private browsing modes.
  }
};

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const streamRef = useRef(null);
  const mergedFrameTypeRef = useRef("private");
  const [view, setView] = useState("home");
  const [photos, setPhotos] = useState([]);
  const [mergedImage, setMergedImage] = useState(null);
  const [showSquareCamera, setShowSquareCamera] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [countdownKey, setCountdownKey] = useState(0);
  const [flash, setFlash] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [timerEnabled, setTimerEnabled] = useState(() => readStoredBoolean("life4cut_timer_enabled", true));
  const [flashEnabled, setFlashEnabled] = useState(() => readStoredBoolean("life4cut_flash_enabled", true));
  const [filterEnabled, setFilterEnabled] = useState(() => readStoredBoolean("life4cut_filter_enabled", true));
  const [selectedFilter, setSelectedFilter] = useState(readStoredFilter);
  const [frameType, setFrameType] = useState("private");

  const selectedFrame = FRAME_PRESETS[frameType] || FRAME_PRESETS.private;

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

  useEffect(() => {
    writeStoredFilter(selectedFilter);
  }, [selectedFilter]);

  const mergePhotos = useCallback((images, options = {}) => {
    const { showCompleteEffect = true } = options;
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
            const slot = PHOTO_SLOTS[i];
            drawImageCover(ctx, loadedImage, slot.x, slot.y, slot.width, slot.height);
          });

          selectedFrame.draw(ctx);
          applyFinalPrintFinish(canvas);
          mergedFrameTypeRef.current = frameType;
          setMergedImage(canvas.toDataURL("image/png"));
          if (showCompleteEffect) {
            setCaptureComplete(true);
            setTimeout(() => setCaptureComplete(false), 780);
          }
        }
      };
      img.src = src;
    });
  }, [frameType, selectedFrame]);

  useEffect(() => {
    if (!mergedImage || photos.length !== PHOTO_COUNT || mergedFrameTypeRef.current === frameType) return;
    mergePhotos(photos, { showCompleteEffect: false });
  }, [frameType, mergePhotos, mergedImage, photos]);

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
    applyBoothRingLight(canvas, 1, PHOTOISM_FILTERS[selectedFilter]?.light);

    const filteredCanvas = filterEnabled ? applyLife4CutFilter(canvas, selectedFilter) : canvas;
    const imgData = filteredCanvas.toDataURL("image/png");

    setPhotos((currentPhotos) => {
      const newPhotos = [...currentPhotos, imgData];
      if (newPhotos.length === PHOTO_COUNT) {
        mergePhotos(newPhotos);
      }
      return newPhotos;
    });

    setTimeout(() => setShowSquareCamera(false), 220);
  }, [filterEnabled, flashEnabled, mergePhotos, selectedFilter]);

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
    setCaptureComplete(false);
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

  const settingSummary = `Timer ${timerEnabled ? "ON" : "OFF"} · Flash ${flashEnabled ? "ON" : "OFF"} · ${filterEnabled ? PHOTOISM_FILTERS[selectedFilter].label : "NO FILTER"}`;

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

  const renderFrameSelector = () => (
    <div className="frame-selector" aria-label="프레임 선택">
      {Object.entries(FRAME_PRESETS).map(([presetId, preset]) => (
        <button
          type="button"
          key={presetId}
          className={`frame-chip ${preset.styleClass} ${frameType === presetId ? "active" : ""}`}
          onClick={() => setFrameType(presetId)}
          aria-pressed={frameType === presetId}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="app app-shell">
      {flash && <div className="flash-overlay" />}
      {captureComplete && <div className="complete-overlay"><span>DONE</span></div>}

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

            {renderFrameSelector()}

            <div className="booth-setting-row" aria-label="촬영 설정">
              {renderSettingToggle("Timer", timerEnabled, setTimerEnabled)}
              {renderSettingToggle("Flash", flashEnabled, setFlashEnabled)}
              {renderSettingToggle("Beauty Filter", filterEnabled, setFilterEnabled)}
            </div>

            <div className="filter-selector" aria-label="필터 선택">
              {Object.entries(PHOTOISM_FILTERS).map(([filterId, filter]) => (
                <button
                  type="button"
                  key={filterId}
                  className={`filter-chip ${selectedFilter === filterId ? "active" : ""}`}
                  onClick={() => setSelectedFilter(filterId)}
                  aria-pressed={selectedFilter === filterId}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : mergedImage ? (
        <section className="result-stage result-view">
          <h2>Your Moment is Ready</h2>
          {renderFrameSelector()}
          <div className="result-preview-card">
            <img className="result-image" src={mergedImage} alt="네컷" />
          </div>
          <div className="result-actions">
            <button className="button accent" onClick={() => downloadImage(mergedImage)}>SAVE</button>
            <button className="button primary" onClick={shareImage}>SHARE</button>
            <button className="button gray" onClick={resetPhotos}>RETAKE</button>
            <button className="button soft" onClick={goHome}>HOME</button>
          </div>
        </section>
      ) : (
        <section className="camera-stage booth-view">
          <div className="capture-header">
            <div className="capture-progress">{String(Math.min(photos.length + 1, PHOTO_COUNT)).padStart(2, "0")} / 04</div>
            <p>{settingSummary}</p>
          </div>
          {renderFrameSelector()}

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
              <div className="ring-light-overlay" />
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
