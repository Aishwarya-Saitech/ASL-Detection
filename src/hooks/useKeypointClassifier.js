/**
 * useKeypointClassifier.js
 *
 * Runs TFLite KeypointClassifier in a Web Worker to avoid global scope 
 * conflicts between MediaPipe and TFLite's Emscripten runtimes.
 *
 * Mirrors Python's KeyPointClassifier:
 *   model/keypoint_classifier/keypoint_classifier.py
 */
import { useState, useEffect, useRef, useCallback } from 'react';
// ClassifierWorker is loaded via new URL(...) in the hook below

const TFLITE_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.7/dist/';

export function useKeypointClassifier() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const workerRef = useRef(null);
  const labelsRef = useRef([]); // To keep labels available for synchronous lookups if needed

  useEffect(() => {
    let cancelled = false;
    let worker = null;

    // 1. Initialize Worker (Standard classic worker from /public)
    try {
      workerRef.current = new Worker('/classifierWorker.js', { type: 'classic' });
      worker = workerRef.current;

      worker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (cancelled) return;

        if (type === 'READY_STATE') {
          setReady(true);
        } else if (type === 'ERROR') {
          setError(payload);
        } else if (type === 'LABELS_LOADED') {
          labelsRef.current = payload;
        }
      };

      // 2. Start initialization in the background
      // Use absolute URLs so the worker can fetch correctly
      const baseUrl = window.location.origin;
      worker.postMessage({
        type: 'INIT',
        payload: {
          wasmPath: TFLITE_WASM_PATH,
          modelUrl: `${baseUrl}/keypoint_classifier.tflite`,
          labelUrl: `${baseUrl}/keypoint_classifier_label.csv`,
        },
      });

    } catch (err) {
       setError(err?.message ?? String(err));
    }

    return () => {
      cancelled = true;
      if (worker) worker.terminate();
    };
  }, []);

  const classify = useCallback((landmarkFlat) => {
    const worker = workerRef.current;
    if (!ready || !worker || !landmarkFlat || landmarkFlat.length !== 42) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const handleMessage = (e) => {
        if (e.data.type === 'RESULT') {
          worker.removeEventListener('message', handleMessage);
          resolve(e.data.payload);
        } else if (e.data.type === 'ERROR') {
          worker.removeEventListener('message', handleMessage);
          resolve(null);
        }
      };
      worker.addEventListener('message', handleMessage);
      worker.postMessage({ type: 'CLASSIFY', payload: landmarkFlat });
    });
  }, [ready]);

  return { ready, error, classify };
}
