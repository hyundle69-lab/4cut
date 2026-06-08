import React, { useCallback, useEffect, useState, useRef } from "react";
import "./App.css";
import { applyLife4CutFilter } from "./utils/photoFilter";

const PHOTO_COUNT = 4;
const CAPTURE_SIZE = 600;
const FRAME_WIDTH = 600;
const FRAME_HEIGHT = 2400;
const PHOTO_SIDE = 560;
const PHOTO_PADDING = (FRAME_WIDTH - PHOTO_SIDE) / 2;
const PHOTO_Y_POSITIONS = [133, 688, 1231, 1785];

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

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [mergedImage, setMergedImage] = useState(null);
  const [showSquareCamera, setShowSquareCamera] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [countdownKey, setCountdownKey] = useState(0);
  const [flash, setFlash] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const selectedFrame = frames[0];

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("카메라 권한을 허용해주세요.");
      return;
    }

    try {
      setCameraError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      setCameraError("카메라 권한을 허용해주세요.");
    }
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    startCamera();

    return () => {
      const stream = videoElement?.srcObject;
      stream?.getTracks?.().forEach((track) => track.stop());
    };
  }, [startCamera]);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

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
    const ctx = canvas?.getContext("2d");

    if (!video || !canvas || !ctx) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    if (!videoWidth || !videoHeight) {
      setCameraError("카메라 화면이 준비된 뒤 촬영해주세요.");
      setShowSquareCamera(false);
      return;
    }

    setFlash(true);
    setShowSquareCamera(true);
    setTimeout(() => setFlash(false), 190);

    const side = Math.min(videoWidth, videoHeight);
    const sx = (videoWidth - side) / 2;
    const sy = (videoHeight - side) / 2;

    ctx.clearRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-CAPTURE_SIZE, 0);
    ctx.drawImage(video, sx, sy, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    ctx.restore();

    const filteredCanvas = applyLife4CutFilter(canvas);
    const imgData = filteredCanvas.toDataURL("image/png");

    setPhotos((currentPhotos) => {
      const newPhotos = [...currentPhotos, imgData];
      if (newPhotos.length === PHOTO_COUNT) {
        mergePhotos(newPhotos);
      }
      return newPhotos;
    });

    setTimeout(() => setShowSquareCamera(false), 220);
  }, [mergePhotos]);

  const takePhoto = () => {
    if (photos.length >= PHOTO_COUNT || countdown > 0 || mergedImage) return;

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

  const resetPhotos = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setPhotos([]);
    setMergedImage(null);
    setCountdown(0);
    setFlash(false);
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

  return (
    <div className="app">
      {flash && <div className="flash-overlay" />}

      {countdown > 0 && (
        <div className="countdown-overlay">
          <span key={countdownKey} className="countdown-number">{countdown}</span>
        </div>
      )}

      <h1>My 4 Cut</h1>

      {mergedImage ? (
        <section className="result-view">
          <h2>사진이 완성되었습니다</h2>
          <img className="result-image" src={mergedImage} alt="네컷" />
          <div className="result-actions">
            <button className="button gray" onClick={resetPhotos}>다시 찍기</button>
            <button className="button accent" onClick={() => downloadImage(mergedImage)}>저장하기</button>
            <button className="button primary" onClick={shareImage}>공유하기</button>
          </div>
        </section>
      ) : (
        <section className="booth-view">
          <div className="camera-wrap">
            <div className="progress-badge">{Math.min(photos.length + 1, PHOTO_COUNT)} / {PHOTO_COUNT}</div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              width="320"
              height="320"
              className="camera-video"
            />
            <div className="face-guide" />
            {showSquareCamera && <div className="capture-outline" />}
          </div>

          {cameraError && <p role="alert" className="camera-error">{cameraError}</p>}

          <canvas ref={canvasRef} width={CAPTURE_SIZE} height={CAPTURE_SIZE} style={{ display: "none" }} />

          <div className="thumbnail-strip" aria-label="촬영된 사진">
            {Array.from({ length: PHOTO_COUNT }).map((_, index) => (
              <div className={`thumbnail-slot ${photos[index] ? "filled" : ""}`} key={index}>
                {photos[index] ? <img src={photos[index]} alt={`${index + 1}번째 사진`} /> : <span>{index + 1}</span>}
              </div>
            ))}
          </div>

          <div className="controls">
            <button className="button primary" onClick={startCamera}>Camera On</button>
            <button className="button accent" onClick={takePhoto} disabled={photos.length >= PHOTO_COUNT || countdown > 0}>
              Take photos ({photos.length}/{PHOTO_COUNT})
            </button>
            <button className="button gray" onClick={resetPhotos}>다시찍기</button>
          </div>
        </section>
      )}
    </div>
  );
}
