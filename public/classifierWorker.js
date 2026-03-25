/**
 * classifierWorker.js
 * 
 * Runs TFLite KeyPointClassifier in a separate thread.
 * This prevents global scope conflicts between MediaPipe (Hands) 
 * and TFLite's Emscripten runtime (which caused "Aborted" or "_malloc" errors).
 */

/* eslint-disable no-restricted-globals */

// Load TensorFlow.js and TFLite from CDN into the worker scope
// Version alpha.7 is known for better stability with global scope loading
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.2.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.7/dist/tf-tflite.min.js');

let model = null;
let labels = [];

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  try {
    if (type === 'INIT') {
      const { wasmPath, modelUrl, labelUrl } = payload;
      
      // Points TFLite to its WASM binaries
      self.tflite.setWasmPath(wasmPath);

      // 1. Fetch labels
      const labelRes = await fetch(labelUrl);
      if (!labelRes.ok) throw new Error(`Labels fetch failed: ${labelRes.status}`);
      const labelText = await labelRes.text();
      labels = labelText.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      // 2. Load model
      model = await self.tflite.loadTFLiteModel(modelUrl);

      self.postMessage({ type: 'READY_STATE', payload: true });
    } 
    
    else if (type === 'CLASSIFY') {
      if (!model) throw new Error('Model not initialized');
      
      const landmarkFlat = payload;
      const tf = self.tf;

      const prediction = tf.tidy(() => {
        const input = tf.tensor2d([landmarkFlat], [1, 42], 'float32');
        const output = model.predict(input);

        // Extract the correct output tensor
        const tensor =
          output && typeof output === 'object' && !output.dataSync
            ? output['output_0'] ?? Object.values(output)[0]
            : output;

        const scores = Array.from(tensor.dataSync());
        const index = scores.indexOf(Math.max(...scores));

        return {
          index,
          label: labels[index] ?? String(index),
          scores,
        };
      });

      self.postMessage({ type: 'RESULT', payload: prediction, id });
    }
  } catch (err) {
    console.error('[ClassifierWorker]', err);
    self.postMessage({ type: 'ERROR', payload: err.message, id });
  }
};
