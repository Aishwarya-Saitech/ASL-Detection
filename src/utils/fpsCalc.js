/**
 * fpsCalc.js
 * Mirrors utils/cvfpscalc.py — rolling average FPS counter.
 */
export class FpsCalc {
  constructor(bufferLen = 10) {
    this._buffer = [];
    this._bufferLen = bufferLen;
    this._last = performance.now();
  }

  get() {
    const now = performance.now();
    const dt = now - this._last;
    this._last = now;

    this._buffer.push(dt);
    if (this._buffer.length > this._bufferLen) {
      this._buffer.shift();
    }

    const avg = this._buffer.reduce((a, b) => a + b, 0) / this._buffer.length;
    return Math.round(1000 / avg);
  }
}
