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
  recognizeHandGesture,
  recognizeTwoHandGesture, // New multi-hand recognizer
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


  // ── History Tracking ─────────────────────────────────────────────────────
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/history');
        if (res.ok) setHistory(await res.json());
      } catch (err) { /* silent */ }
    };
    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, []);

  const saveToHistory = useCallback(async (sign) => {
    try {
      const res = await fetch('http://localhost:5000/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sign, timestamp: new Date().toISOString() }),
      });
      console.log("res:", res);

      if (res.ok) setHistory(prev => [{ sign, timestamp: new Date().toISOString() }, ...prev].slice(0, 100));
    } catch (err) {
      console.warn('[SignLens] Could not save history');
    }
  }, []);

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

  // ── Speech Synthesis ────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
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

      // Mirror display
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      const results = await detect(video);

      const currentFps = fpsCalcRef.current.get();
      setFps(currentFps);

      let detectedThisFrame = null;

      if (results?.multiHandLandmarks?.length) {
        const hCount = results.multiHandLandmarks.length;
        setHandCount(hCount);

        const allMirroredLists = results.multiHandLandmarks.map(lms =>
          calcLandmarkList(w, h, lms).map(([x, y]) => [w - x, y])
        );

        // 1. Two-Hand Global Priority (HELP, MORE)
        const multiHandMatch = recognizeTwoHandGesture(allMirroredLists);
        if (multiHandMatch) {
          detectedThisFrame = multiHandMatch;
          // Visual: Highlight both hands with same label
          for (let hi = 0; hi < hCount; hi++) {
            const brect = calcBoundingRect(allMirroredLists[hi]);
            drawBoundingRect(ctx, brect);
            drawLandmarks(ctx, allMirroredLists[hi]);
            const handLabel = results.multiHandedness?.[hi]?.label ?? '';
            drawInfoText(ctx, brect, handLabel, multiHandMatch);
          }
        } else {
          // 2. Individual Hand Analysis
          for (let hi = 0; hi < hCount; hi++) {
            const mirroredList = allMirroredLists[hi];
            const brect = calcBoundingRect(mirroredList);
            const flat = preProcessLandmark(mirroredList);
            latestLandmarksRef.current = flat;

            const heuristicMatch = recognizeHandGesture(mirroredList);
            let label = heuristicMatch;

            if (!label) {
              const prediction = await classify(flat);
              if (prediction) label = prediction.label;
            }

            drawBoundingRect(ctx, brect);
            drawLandmarks(ctx, mirroredList);
            if (label) {
              const handLabel = results.multiHandedness?.[hi]?.label ?? 'Unknown';
              drawInfoText(ctx, brect, handLabel, label);
              detectedThisFrame = label;
            }
          }
        }
      } else {
        setHandCount(0);
        latestLandmarksRef.current = null;
      }

      drawInfo(ctx, currentFps, modeRef.current, numberRef.current);

      if (detectedThisFrame) {
        if (detectedThisFrame === lastSign) {
          signStableCount++;
          // Stability threshold (reduced for words/letters speed)
          const threshold = detectedThisFrame.length > 1 ? 25 : 12;

          if (signStableCount === threshold) {
            setDetectedSign(detectedThisFrame);

            // Speak if it's a word
            if (detectedThisFrame.length > 1) {
              speak(detectedThisFrame);
              saveToHistory(detectedThisFrame);
            }

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
  }, [cameraOn, modelsReady, detect, classify, speak, saveToHistory]);

  // ── Keyboard mode switching ─────────────────────────────────────────────
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
      } else if (key === 's' || key === 'S') {
        // Speak current buffer
        const fullWord = subtitles.join('');
        if (fullWord) speak(fullWord);
      } else {
        let index = -1;
        // A-Z (0-25)
        if (key >= 'A' && key <= 'Z') index = key.charCodeAt(0) - 65;
        if (key >= 'a' && key <= 'z') index = key.charCodeAt(0) - 97;
        // 0-9 (26-35)
        if (key >= '0' && key <= '9') index = parseInt(key) + 26;

        // Custom keys for words (36+)
        if (key === '!') index = 36; // HELLO
        if (key === '@') index = 37; // HELP
        if (key === '#') index = 38; // THANKYOU
        if (key === '$') index = 39; // PLEASE
        if (key === '%') index = 40; // YES
        if (key === '^') index = 41; // NO
        if (key === '&') index = 42; // LOVE
        if (key === '*') index = 43; // PEACE
        if (key === '(') index = 44; // OK

        if (index !== -1) {
          numberRef.current = index;
          if (modeRef.current === MODE_LOG_KEYPOINT && latestLandmarksRef.current) {
            const row = [index, ...latestLandmarksRef.current];
            setCaptureList((prev) => [...prev, row]);
          }
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [captureList.length, subtitles, speak]);

  const clearSubtitles = () => setSubtitles([]);

  const modeLabel = mode === MODE_LOG_KEYPOINT ? 'Logging Key Point' : 'Inference';



  return (
    <div className="asl-detector">
      {/* ── Header ── */}
      <div className="detector-header glass-panel">
        <div className="header-left">
          <div className="status-row">
            <div className={`status-dot ${modelsReady ? 'ready' : 'loading'}`} />
            <span className="status-label">
              {modelsReady ? 'SignLens AI Active' : loadingStatus}
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
        <div className="error-banner animate-fade-in" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{handsError || classifierError || cameraError}</span>
        </div>
      )}

      {/* ── Loading progress bar ── */}
      {!modelsReady && !handsError && !classifierError && (
        <div className="loading-bar-wrap">
          <div className="loading-bar" />
        </div>
      )}

      {/* ── Video Canvas ── */}
      <div className={`video-container ${cameraOn ? 'glow-feed' : ''}`}>
        <video ref={videoRef} className="hidden-video" playsInline muted />
        <canvas ref={canvasRef} className="detection-canvas" id="asl-canvas" />

        {cameraOn && <div className="scanline" />}

        {!cameraOn && (
          <div className="camera-placeholder">
            <div className="placeholder-icon">✨</div>
            <p>Vision Feed Paused</p>
            <p className="placeholder-sub">
              {modelsReady
                ? 'Ready for intelligent recognition'
                : 'Connecting to AI neural core…'}
            </p>
          </div>
        )}

        {/* Recording Indicator Overlay */}
        {mode === MODE_LOG_KEYPOINT && (
          <div className="recording-overlay animate-fade-in">
            <div className="rec-dot" />
            <div className="rec-text">
              LOGGING MODE: Record Dataset
              <span className="capture-count">{captureList.length} samples</span>
            </div>
          </div>
        )}

        {/* Live sign badge overlay */}
        {cameraOn && detectedSign && (
          <div className="live-sign-badge" aria-live="polite">
            <div className="detecting-pulse" />
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
            {modelsReady ? '▶ Start Intelligence' : '⏳ Initializing…'}
          </button>
        ) : (
          <button id="btn-stop-camera" className="btn btn-danger" onClick={stopCamera}>
            ⏹ Stop Vision
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
            📥 Export Dataset ({captureList.length})
          </button>
        )}

        <div className="mode-toggle glass-panel">
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

      {/* ── Subtitle / Interpetation ── */}
      <div className="subtitle-section glass-panel">
        <div className="subtitle-header">
          <span>💬 Interpretation Stream</span>
          <div className="header-chips">
            {subtitles.length > 0 && <span className="subtitle-count">{subtitles.length} units</span>}
          </div>
        </div>
        <div className="subtitle-strip" id="subtitle-strip" aria-live="polite">
          {subtitles.length === 0 ? (
            <span className="subtitle-empty">Sign letters or words to see them interpreted here…</span>
          ) : (
            subtitles.map((letter, i) => (
              <span key={i} className="subtitle-letter animate-fade-in">
                {letter}
              </span>
            ))
          )}
        </div>
        {subtitles.length > 0 && (
          <div className="subtitle-word">
            <span className="word-label">Output:</span>
            <span className="word-value">{subtitles.join(' ')}</span>
            <div className="word-actions">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => speak(subtitles.join(' '))}
                title="Speak text"
              >
                🔊 Speak
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => navigator.clipboard?.writeText(subtitles.join(' '))}
                title="Copy to clipboard"
              >
                📋 Copy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Session History (From Server) ── */}
      {history.length > 0 && (
        <div className="history-section animate-fade-in">
          <div className="history-header">
            <h4>Recent Recognitions</h4>
          </div>
          <div className="history-list">
            {history.slice(0, 5).map((item, idx) => (
              <div key={idx} className="history-item">
                <span className="hist-val">{item.sign}</span>
                <span className="hist-time">{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Keyboard hint ── */}
      <div className="keyboard-hint glass-panel">
        <span>⌨️ Shortcuts:</span>
        <span><kbd>N</kbd> Infer</span>
        <span><kbd>K</kbd> Log</span>
        <span><kbd>S</kbd> Speak</span>
        <span><kbd>A–Z/!@#$</kbd> Capture</span>
      </div>
    </div>
  );
}
