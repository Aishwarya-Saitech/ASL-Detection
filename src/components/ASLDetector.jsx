/**
 * ASLDetector.jsx
 *
 * Core detection component — the React equivalent of the main() loop in app.py.
 *
 * Pipeline (mirrors Python):
 *   Webcam frame → MediaPipe Hands → landmark list → pre-process →
 *   KeyPointClassifier → draw bounding rect + landmarks + label → canvas
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { useHandDetection } from '../hooks/useHandDetection';
import { useKeypointClassifier } from '../hooks/useKeypointClassifier';
import {
  calcLandmarkList,
  calcBoundingRect,
  preProcessLandmark,
  drawLandmarks,
  drawBoundingRect,
  drawInfoText,
  drawInfo,
} from '../utils/landmarkUtils';
import { FpsCalc } from '../utils/fpsCalc';
import './ASLDetector.css';

// Mode constants — mirrors Python select_mode()
const MODE_INFERENCE = 0;
const MODE_LOG_KEYPOINT = 1;

export default function ASLDetector({ onDetection }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const fpsCalcRef = useRef(new FpsCalc(10));
  const modeRef = useRef(MODE_INFERENCE);
  const numberRef = useRef(-1);
  const runningRef = useRef(false);
  // Keep a stable ref to onDetection so it never invalidates the detection loop
  const onDetectionRef = useRef(onDetection);
  useEffect(() => { onDetectionRef.current = onDetection; }, [onDetection]);

  const [cameraOn, setCameraOn] = useState(false);
  const [mode, setMode] = useState(MODE_INFERENCE);
  const [detectedSign, setDetectedSign] = useState(null);
  const [fps, setFps] = useState(0);
  const [handCount, setHandCount] = useState(0);
  const [subtitles, setSubtitles] = useState([]);
  const [cameraError, setCameraError] = useState(null);
  const [captureList, setCaptureList] = useState([]); // Buffer for logged points

  // Keep a ref to the latest processed landmarks for the key-press logger
  const latestLandmarksRef = useRef(null);

  const { ready: handsReady, error: handsError, detect } = useHandDetection({
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
    maxNumHands: 2,
  });

  const { ready: classifierReady, error: classifierError, classify } = useKeypointClassifier();

  const modelsReady = handsReady && classifierReady;

  // ── Dataset Management ───────────────────────────────────────────────────
  const downloadDataset = useCallback(() => {
    if (captureList.length === 0) return;
    const content = captureList.map((row) => row.join(',')).join('\n');
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keypoint_data_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [captureList]);

  // Loading status string for UX
  const loadingStatus = !handsReady && !classifierReady
    ? '✨ Syncing AI Core…'
    : !handsReady
      ? '🖐 Initializing Lens…'
      : !classifierReady
        ? '🧠 Deploying Brain…'
        : '';

  // ── Camera start / stop ──────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
        audio: false,
      });
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        setCameraOn(true);
      }
    } catch (err) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access and try again.'
          : err.name === 'NotFoundError'
            ? 'No camera found. Please connect a webcam.'
            : err.message
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    const video = videoRef.current;
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
    runningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setCameraOn(false);
    setDetectedSign(null);
    setHandCount(0);
    setFps(0);
  }, []);

  // ── Detection loop — mirrors Python while True: loop ─────────────────────
  useEffect(() => {
    if (!cameraOn || !modelsReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    runningRef.current = true;

    let lastSign = null;
    let signStableCount = 0;

    async function loop() {
      if (!runningRef.current) return;

      if (video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');

      // Mirror display — cv.flip(image, 1) in Python
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      // Run MediaPipe Hands
      const results = await detect(video);

      const currentFps = fpsCalcRef.current.get();
      setFps(currentFps);

      let detectedThisFrame = null;

      if (results?.multiHandLandmarks?.length) {
        setHandCount(results.multiHandLandmarks.length);

        for (let hi = 0; hi < results.multiHandLandmarks.length; hi++) {
          const landmarks = results.multiHandLandmarks[hi];
          const handednessInfo = results.multiHandedness?.[hi];
          const handLabel = handednessInfo?.label ?? 'Unknown';

          // calc_landmark_list
          const landmarkList = calcLandmarkList(w, h, landmarks);

          // Mirror X coords for flipped display
          const mirroredList = landmarkList.map(([x, y]) => [w - x, y]);

          // calc_bounding_rect
          const brect = calcBoundingRect(mirroredList);

          // pre_process_landmark
          const flat = preProcessLandmark(mirroredList);

          // Store latest pre-processed points for the key-press logger
          latestLandmarksRef.current = flat;

          // KeyPointClassifier (Now Async / Worker-based)
          const prediction = await classify(flat);

          // Drawing — mirrors Python drawing functions
          drawBoundingRect(ctx, brect);
          drawLandmarks(ctx, mirroredList);
          if (prediction) {
            drawInfoText(ctx, brect, handLabel, prediction.label);
            detectedThisFrame = prediction.label;
          }
        }
      } else {
        setHandCount(0);
        latestLandmarksRef.current = null;
      }

      // FPS + mode overlay
      drawInfo(ctx, currentFps, modeRef.current, numberRef.current);

      // Subtitle accumulation with stability check (~0.5 s @ 30 fps)
      if (detectedThisFrame) {
        if (detectedThisFrame === lastSign) {
          signStableCount++;
          if (signStableCount === 15) {
            setDetectedSign(detectedThisFrame);
            setSubtitles((prev) => {
              const next = [...prev, detectedThisFrame];
              return next.length > 30 ? next.slice(next.length - 30) : next;
            });
            if (onDetectionRef.current) onDetectionRef.current(detectedThisFrame);
          }
        } else {
          lastSign = detectedThisFrame;
          signStableCount = 0;
          setDetectedSign(detectedThisFrame);
        }
      } else {
        lastSign = null;
        signStableCount = 0;
        setDetectedSign(null);
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }

    loop();

    return () => {
      runningRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, modelsReady, detect, classify]);

  // ── Keyboard mode switching — mirrors select_mode() in Python ─────────────
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;

      if (key === 'n' || key === 'N') {
        modeRef.current = MODE_INFERENCE;
        setMode(MODE_INFERENCE);
      } else if (key === 'k' || key === 'K') {
        modeRef.current = MODE_LOG_KEYPOINT;
        setMode(MODE_LOG_KEYPOINT);
      } else {
        // Logging Trigger
        let index = -1;
        if (key >= 'A' && key <= 'Z') index = key.charCodeAt(0) - 65;
        if (key >= 'a' && key <= 'z') index = key.charCodeAt(0) - 97;
        if (key >= '0' && key <= '9') index = parseInt(key) + 26;

        if (index !== -1) {
          numberRef.current = index;
          // Capture current landmarks and prepend the index
          if (modeRef.current === MODE_LOG_KEYPOINT && latestLandmarksRef.current) {
            const row = [index, ...latestLandmarksRef.current];
            setCaptureList((prev) => [...prev, row]);
            console.log(`[Captured] ID:${index} (${key}) - Samples: ${captureList.length + 1}`);
          }
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [captureList.length]); // Re-bind when list length changes to keep console log count accurate

  const clearSubtitles = () => setSubtitles([]);

  const modeLabel = mode === MODE_LOG_KEYPOINT ? 'Logging Key Point' : 'Inference';

  return (
    <div className="asl-detector">
      {/* ── Header ── */}
      <div className="detector-header">
        <div className="header-left">
          <div className="status-row">
            <div className={`status-dot ${modelsReady ? 'ready' : 'loading'}`} />
            <span className="status-label">
              {/* {modelsReady ? 'Models Ready' : loadingStatus} */}
              {modelsReady ? 'Models Ready' : loadingStatus}
            </span>
          </div>
          <div className="mode-badge">{modeLabel}</div>
        </div>
        <div className="header-stats">
          <div className="stat-chip">
            <span className="stat-icon">👁️</span>
            <span>{handCount} Active</span>
          </div>
          <div className="stat-chip fps-chip">
            <span className="stat-icon">⚡</span>
            <span>{fps} FPS</span>
          </div>
        </div>
      </div>

      {/* ── Errors ── */}
      {(handsError || classifierError || cameraError) && (
        <div className="error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{handsError || classifierError || cameraError}</span>
        </div>
      )}

      {/* ── Loading progress bar ── */}
      {!modelsReady && !handsError && !classifierError && (
        <div className="loading-bar-wrap" aria-label="Loading models">
          <div className="loading-bar" />
        </div>
      )}

      {/* ── Video Canvas ── */}
      <div className="video-container">
        <video ref={videoRef} className="hidden-video" playsInline muted />
        <canvas ref={canvasRef} className="detection-canvas" id="asl-canvas" />

        {!cameraOn && (
          <div className="camera-placeholder">
            <div className="placeholder-icon">✨</div>
            <p>Vision Feed Paused</p>
            <p className="placeholder-sub">
              {modelsReady
                ? 'Ready for SignLens detection'
                : 'Awaiting AI core connection…'}
            </p>
          </div>
        )}

        {/* Recording Indicator Overlay */}
        {mode === MODE_LOG_KEYPOINT && (
          <div className="recording-overlay animate-fade-in">
            <div className="rec-dot" />
            <div className="rec-text">
              LOGGING MODE: Press keys to record
              <span className="capture-count">{captureList.length} samples</span>
            </div>
          </div>
        )}

        {/* Live sign badge overlay */}
        {cameraOn && detectedSign && (
          <div className="live-sign-badge" aria-live="polite" aria-label={`Detected: ${detectedSign}`}>
            <span className="sign-letter">{detectedSign}</span>
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="controls-row">
        {!cameraOn ? (
          <button
            id="btn-start-camera"
            className="btn btn-primary"
            onClick={startCamera}
            disabled={!modelsReady}
          >
            {modelsReady ? '▶ Start Camera' : '⏳ Loading…'}
          </button>
        ) : (
          <button id="btn-stop-camera" className="btn btn-danger" onClick={stopCamera}>
            ⏹ Stop Camera
          </button>
        )}
        <button
          id="btn-clear-subtitles"
          className="btn btn-secondary"
          onClick={clearSubtitles}
        >
          🗑 Clear Text
        </button>

        {mode === MODE_LOG_KEYPOINT && captureList.length > 0 && (
          <button
            className="btn btn-primary btn-dataset animate-fade-in"
            onClick={downloadDataset}
          >
            📥 Download ({captureList.length}) Samples
          </button>
        )}

        <div className="mode-toggle">
          <button
            id="btn-mode-inference"
            className={`btn btn-sm ${mode === MODE_INFERENCE ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => { modeRef.current = MODE_INFERENCE; setMode(MODE_INFERENCE); }}
          >
            N · Infer
          </button>
          <button
            id="btn-mode-log"
            className={`btn btn-sm ${mode === MODE_LOG_KEYPOINT ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => { modeRef.current = MODE_LOG_KEYPOINT; setMode(MODE_LOG_KEYPOINT); }}
          >
            K · Log
          </button>
        </div>
      </div>

      {/* ── Subtitle / accumulation strip ── */}
      <div className="subtitle-section">
        <div className="subtitle-header">
          <span>💬 Interpreted Results</span>
          {subtitles.length > 0 && (
            <span className="subtitle-count">{subtitles.length} letters</span>
          )}
        </div>
        <div className="subtitle-strip" id="subtitle-strip" aria-live="polite">
          {subtitles.length === 0 ? (
            <span className="subtitle-empty">Start signing to see detected letters here…</span>
          ) : (
            subtitles.map((letter, i) => (
              <span key={i} className="subtitle-letter">
                {letter}
              </span>
            ))
          )}
        </div>
        {subtitles.length > 0 && (
          <div className="subtitle-word">
            <span className="word-label">Word:</span>
            <span className="word-value">{subtitles.join('')}</span>
            <button
              className="btn btn-sm btn-ghost copy-btn"
              onClick={() => navigator.clipboard?.writeText(subtitles.join(''))}
              title="Copy to clipboard"
            >
              📋
            </button>
          </div>
        )}
      </div>

      {/* ── Keyboard hint ── */}
      <div className="keyboard-hint">
        <span>⌨️</span>
        <span><kbd>N</kbd> Inference</span>
        <span><kbd>K</kbd> Log mode</span>
        <span><kbd>A–Z / 0-9</kbd> Capture Sample</span>
      </div>
    </div>
  );
}
