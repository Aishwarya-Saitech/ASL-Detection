/**
 * landmarkUtils.js
 * Mirrors the Python pre_process_landmark, calc_bounding_rect,
 * calc_landmark_list, draw_landmarks, draw_bounding_rect, draw_info_text
 * functions from app.py — ported 1-to-1 to plain JS.
 */

/** Convert MediaPipe NormalizedLandmarks → pixel [x, y] list */
export function calcLandmarkList(imageWidth, imageHeight, landmarks) {
  return landmarks.map((lm) => [
    Math.min(Math.round(lm.x * imageWidth), imageWidth - 1),
    Math.min(Math.round(lm.y * imageHeight), imageHeight - 1),
  ]);
}

/** Axis-aligned bounding box [x1, y1, x2, y2] over all landmarks */
export function calcBoundingRect(landmarkList) {
  const xs = landmarkList.map((p) => p[0]);
  const ys = landmarkList.map((p) => p[1]);
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  const x2 = Math.max(...xs);
  const y2 = Math.max(...ys);
  return [x1, y1, x2, y2];
}

/**
 * Mirrors pre_process_landmark:
 * 1. Shift relative to wrist (landmark[0])
 * 2. Flatten to 1-D
 * 3. Normalise by max absolute value
 */
export function preProcessLandmark(landmarkList) {
  const temp = landmarkList.map(([x, y]) => [x, y]);
  const [baseX, baseY] = temp[0];
  for (let i = 0; i < temp.length; i++) {
    temp[i][0] -= baseX;
    temp[i][1] -= baseY;
  }
  const flat = temp.flat();
  const maxVal = Math.max(...flat.map(Math.abs));
  return maxVal === 0 ? flat : flat.map((v) => v / maxVal);
}

// ─── Canvas Drawing ───────────────────────────────────────────────────────────

const CONNECTIONS = [
  // Palm
  [0, 1], [1, 2], [2, 5], [5, 9], [9, 13], [13, 17], [17, 0],
  // Thumb
  [1, 2], [2, 3], [3, 4],
  // Index
  [5, 6], [6, 7], [7, 8],
  // Middle
  [9, 10], [10, 11], [11, 12],
  // Ring
  [13, 14], [14, 15], [15, 16],
  // Pinky
  [17, 18], [18, 19], [19, 20],
];

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

/** Draw the hand skeleton on a canvas 2d context — mirrors draw_landmarks */
export function drawLandmarks(ctx, landmarkList) {
  if (!landmarkList || landmarkList.length === 0) return;

  // Connections – black outline then white fill
  for (const [a, b] of CONNECTIONS) {
    const pa = landmarkList[a];
    const pb = landmarkList[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Key points
  for (let i = 0; i < landmarkList.length; i++) {
    const [x, y] = landmarkList[i];
    const r = FINGERTIPS.has(i) ? 8 : 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Draw bounding rect — mirrors draw_bounding_rect */
export function drawBoundingRect(ctx, brect) {
  const [x1, y1, x2, y2] = brect;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
}

/** Draw the label banner above the bounding rect — mirrors draw_info_text */
export function drawInfoText(ctx, brect, handedness, handSignText) {
  const [x1, y1] = brect;
  const bannerH = 24;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x1, y1 - bannerH, brect[2] - x1, bannerH);

  const label = handedness + (handSignText ? ':' + handSignText : '');
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px monospace';
  ctx.fillText(label, x1 + 5, y1 - 6);
}

/** Draw FPS + mode overlay in top-left — mirrors draw_info */
export function drawInfo(ctx, fps, mode, number) {
  // FPS – black shadow then white text
  const fpsStr = 'FPS:' + fps;
  ctx.font = 'bold 22px monospace';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000000';
  ctx.strokeText(fpsStr, 10, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(fpsStr, 10, 32);

  const modeLabels = ['Logging Key Point', 'Capturing Landmarks From Provided Dataset Mode'];
  if (mode >= 1 && mode <= 2) {
    ctx.font = '14px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MODE:' + modeLabels[mode - 1], 10, 90);
    if (number >= 0 && number <= 9) {
      ctx.fillText('NUM:' + number, 10, 110);
    }
  }
}
