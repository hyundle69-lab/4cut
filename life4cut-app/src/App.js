import React, { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { applyLife4CutFilter } from "./utils/photoFilter";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [mergedImage, setMergedImage] = useState(null);
  const [showSquareCamera, setShowSquareCamera] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(true);
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [flash, setFlash] = useState(false);
  const [animateCountdown, setAnimateCountdown] = useState(false);
  const [shutterEffect, setShutterEffect] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("이 브라우저에서는 카메라를 지원하지 않습니다.");
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
      setCameraError("카메라 권한을 허용한 뒤 다시 시도해주세요.");
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

  const takePhoto = () => {
    if (photos.length >= 4 || countdown > 0) return;

    const doCapture = () => {
      if (flashEnabled) {
        setFlash(true);
        setTimeout(() => setFlash(false), 100);
      }

      setShutterEffect(true);
      setTimeout(() => setShutterEffect(false), 200);

      setShowSquareCamera(true);

      setTimeout(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        if (!videoWidth || !videoHeight) {
          setCameraError("카메라 화면이 준비된 뒤 촬영해주세요.");
          setShowSquareCamera(false);
          return;
        }

        const side = Math.min(videoWidth, videoHeight);
        const sx = (videoWidth - side) / 2;
        const sy = (videoHeight - side) / 2;

        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, sx, sy, side, side, 0, 0, 600, 600);
        ctx.restore();

        const filteredCanvas = applyLife4CutFilter(canvas);
        const imgData = filteredCanvas.toDataURL("image/png");
        const newPhotos = [...photos, imgData];
        setPhotos(newPhotos);

        if (newPhotos.length === 4) {
          mergePhotos(newPhotos);
        }

        setTimeout(() => {
          setShowSquareCamera(false);
        }, 100);
      }, 100);
    };

    if (countdownEnabled) {
      setCountdown(5);
      setAnimateCountdown(true);
      let seconds = 5;
      const interval = setInterval(() => {
        seconds--;
        setCountdown(seconds);
        setAnimateCountdown(true);
        if (seconds <= 0) {
          clearInterval(interval);
          setAnimateCountdown(false);
          doCapture();
        }
      }, 1000);
    } else {
      doCapture();
    }
  };

  const drawFrame = (ctx) => {
    ctx.save();
    ctx.fillStyle = "#111";

    const sideLength = 560;
    const sidePadding = (600 - sideLength) / 2;
    const adjustedYPositions = [133, 688, 1231, 1785];

    ctx.beginPath();
    ctx.rect(0, 0, 600, 2400);
    adjustedYPositions.forEach((y) => {
      ctx.rect(sidePadding, y, sideLength, sideLength);
    });
    ctx.fill("evenodd");
    ctx.fillStyle = "#fff";
    ctx.font = "700 34px Courier New, monospace";
    ctx.textAlign = "center";
    ctx.fillText("My 4 Cut", 300, 78);
    ctx.font = "24px Courier New, monospace";
    ctx.fillText(new Date().toLocaleDateString(), 300, 2350);
    ctx.restore();
  };

  const mergePhotos = (images) => {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 2400;
    const ctx = canvas.getContext("2d");

    const sideLength = 560;
    const sidePadding = (600 - sideLength) / 2;
    const adjustedYPositions = [133, 688, 1231, 1785];

    const loadedImages = new Array(4).fill(null);
    let loadedCount = 0;

    images.forEach((src, index) => {
      const img = new Image();
      img.onload = () => {
        loadedImages[index] = img;
        loadedCount++;

        if (loadedCount === 4) {
          loadedImages.forEach((img, i) => {
            if (!img) return;
            ctx.drawImage(img, sidePadding, adjustedYPositions[i], sideLength, sideLength);
          });

          drawFrame(ctx);
          const merged = canvas.toDataURL("image/png");
          setMergedImage(merged);
        }
      };
      img.src = src;
    });
  };

  const resetPhotos = () => {
    setPhotos([]);
    setMergedImage(null);
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

  return (
    <div style={{ fontFamily: "'Courier New', serif", padding: "20px", background: "#fefcf3", textAlign: "center", minHeight: "100vh" }}>
      <h1 style={{ fontSize: "32px", color: "#4a3f35", marginBottom: "16px" }}>📸 My 4 Cut</h1>

      {flash && <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "white", opacity: 1, zIndex: 9999 }} />}

      {shutterEffect && <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "black", opacity: 0.5, zIndex: 9998 }} />}

      {countdown > 0 && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0,0,0,0.5)",
          color: "#fffbe7",
          fontSize: "120px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          animation: animateCountdown ? 'scaleUp 0.5s ease-in-out' : 'none'
        }}>{countdown}</div>
      )}

      <style>{`
        @keyframes scaleUp {
          0% { transform: scale(0.6); opacity: 0.3; }
          100% { transform: scale(1); opacity: 1; }
        }
        .button {
          padding: 12px 20px;
          margin: 6px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-family: 'Courier New', serif;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .primary { background: #ffb703; color: #fffbe7; }
        .accent { background: #fb8500; color: #fffbe7; }
        .gray { background: #e5e5e5; color: #4a3f35; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: "320px", height: "320px", borderRadius: "16px", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", background: "#fffbe7" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            width="320"
            height="320"
            style={{ position: "absolute", top: 0, left: 0, objectFit: "cover", transform: "scaleX(-1)" }}
          />
          {showSquareCamera && <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "2px dashed #fb8500", boxSizing: "border-box", pointerEvents: "none" }} />}
        </div>
        {cameraError && <p role="alert" style={{ maxWidth: "320px", color: "#9b2226", fontWeight: 700 }}>{cameraError}</p>}

        <canvas ref={canvasRef} width="600" height="600" style={{ display: "none" }} />

        <div style={{ marginTop: "20px" }}>
          <button className="button primary" onClick={startCamera}>📷 Camera On</button>
          <button className="button accent" onClick={takePhoto} disabled={photos.length >= 4}>📸 Take photos ({photos.length}/4)</button>
          <button className="button gray" onClick={resetPhotos}>🔄 다시찍기</button>
        </div>

        <div style={{ marginTop: "10px" }}>
          <button className="button gray" onClick={() => setFlashEnabled((prev) => !prev)}>
            {flashEnabled ? "💡 Flash off" : "💡 Flash on"}
          </button>
          <button className="button gray" onClick={() => setCountdownEnabled((prev) => !prev)}>
            {countdownEnabled ? "⏱ Countdown Off" : "⏱ Countdown on"}
          </button>
        </div>
      </div>

      {mergedImage && (
        <div style={{ marginTop: "30px" }}>
          <h3 style={{ fontSize: "24px", color: "#4a3f35" }}>🎉 Memories Complete!</h3>
          <img src={mergedImage} alt="네컷" style={{ width: "300px", borderRadius: "12px" }} />
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap" }}>
            <button className="button accent" onClick={() => downloadImage(mergedImage)}>💾 저장하기</button>
            <button className="button primary" onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: "내 인생네컷",
                  text: "인생네컷 완성했어요!",
                  files: [dataURLtoFile(mergedImage, "life4cut.png")],
                });
              } else {
                alert("이 브라우저에서는 공유 기능을 지원하지 않습니다.");
              }
            }}>📤 공유하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
