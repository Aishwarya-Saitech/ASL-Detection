/**
 * useHandDetection.js
 *
 * Consumes MediaPipe Hands (loaded from scripts in index.html) to detect landmarks.
 *
 * Mirrors app.py:
 *   mp_hands.Hands(max_num_hands=2,
 *                  min_detection_confidence=0.7,
 *                  min_tracking_confidence=0.5)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

let globalHandsInstance = null;
let globalHandsInitPromise = null;

export function useHandDetection({
  minDetectionConfidence = 0.7,
  minTrackingConfidence = 0.5,
  maxNumHands = 2,
} = {}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const handsRef = useRef(null);
  const pendingResolverRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Wait for MediaPipe script to be available
        const checkReady = () => !!window.Hands;
        let attempts = 0;
        while (!checkReady() && attempts < 50) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }

        if (!window.Hands) {
          throw new Error('MediaPipe Hands script failed to load');
        }

        if (cancelled) return;

        // Ensure TF is ready if present
        if (window.tf) await window.tf.ready();

        // ── Singleton Pattern to avoid "Aborted" conflict ──
        // Only one MediaPipe instance should ever exist in the global scope.
        if (!globalHandsInstance) {
          if (!globalHandsInitPromise) {
            globalHandsInitPromise = (async () => {
              const hands = new window.Hands({
                locateFile: (file) =>
                  `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
              });
              
              hands.setOptions({
                maxNumHands: 2, // Fixed for singleton
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.5,
              });
              
              await hands.initialize();
              globalHandsInstance = hands;
              return hands;
            })();
          }
          await globalHandsInitPromise;
        }

        const hands = globalHandsInstance;
        
        // Update options for this specific hook usage if different
        hands.setOptions({ maxNumHands, minDetectionConfidence, minTrackingConfidence });

        hands.onResults((results) => {
          if (pendingResolverRef.current) {
            pendingResolverRef.current(results);
            pendingResolverRef.current = null;
          }
        });

        // When results arrive, only resolve if it matches THIS hook instance
        const onResults = (results) => {
          if (cancelled) return;
          if (pendingResolverRef.current) {
            pendingResolverRef.current(results);
            pendingResolverRef.current = null;
          }
        };

        hands.onResults(onResults);

        if (!cancelled) {
          handsRef.current = hands;
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message ?? String(err));
      }
    }

    init();

    return () => {
      cancelled = true;
      // Note: We DO NOT call hands.close() on the singleton instance,
      // as it would break future mounts. We just disconnect this hook's refs.
      handsRef.current = null;
    };
  }, [minDetectionConfidence, minTrackingConfidence, maxNumHands]);

  const detect = useCallback(async (imageSource) => {
    if (!handsRef.current || !ready) return null;
    return new Promise((resolve) => {
      pendingResolverRef.current = resolve;
      handsRef.current.send({ image: imageSource });
    });
  }, [ready]);

  return { ready, error, detect };
}
