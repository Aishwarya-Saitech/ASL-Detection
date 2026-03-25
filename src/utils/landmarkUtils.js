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
// ─── Gesture Recognition (Heuristics) ──────────────────────────────────

/**
 * Heuristic-based recognizer for Numbers (0-9) and common Words.
 * Returns a label if a high-confidence match is found.
 */
export function recognizeHandGesture(landmarkList) {
  if (!landmarkList || landmarkList.length < 21) return null;

  // Use landmark coordinates for distance calculations
  const wrist = landmarkList[0];

  // 1. Determine which fingers are "up" (extended away from wrist/knuckle)
  const isFingerUp = (tipIdx, pipIdx) => {
    const tip = landmarkList[tipIdx];
    const pip = landmarkList[pipIdx]; // Proximal Interphalangeal joint
    // Distance from wrist to tip vs distance from wrist to PIP
    const distTip = Math.sqrt((tip[0] - wrist[0]) ** 2 + (tip[1] - wrist[1]) ** 2);
    const distPip = Math.sqrt((pip[0] - wrist[0]) ** 2 + (pip[1] - wrist[1]) ** 2);
    return distTip > distPip;
  };

  // Special thumb logic (horizontal distance for ASL)
  const isThumbUp = () => {
    const tip = landmarkList[4];
    const ip = landmarkList[3];
    const mcp = landmarkList[2];
    // Compare X distance for thumb extension
    return Math.abs(tip[0] - mcp[0]) > Math.abs(ip[0] - mcp[0]);
  };

  const thumb = isThumbUp();
  const index = isFingerUp(8, 6);
  const middle = isFingerUp(12, 10);
  const ring = isFingerUp(16, 14);
  const pinky = isFingerUp(20, 18);

  // 2. Logic Mapping (ASL & Common Gestures)

  // Helpers for distances (Thumb to other tips)
  const dist = (idx1, idx2) => {  // new
    const p1 = landmarkList[idx1];
    const p2 = landmarkList[idx2];
    return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
  };

  const t_i = dist(4, 8); // Thumb to Index
  const t_m = dist(4, 12); // Thumb to Middle
  const t_r = dist(4, 16); // Thumb to Ring
  const t_p = dist(4, 20); // Thumb to Pinky

  // Numbers 0-5
  if (!index && !middle && !ring && !pinky && !thumb) return '0';
  if (index && !middle && !ring && !pinky && !thumb) return '1';
  if (index && middle && !ring && !pinky && !thumb) return '2';
  if (thumb && index && middle && !ring && !pinky) return '3';
  if (index && middle && ring && pinky && !thumb) return '4';
  if (index && middle && ring && pinky && thumb) return '5';

  // Numbers 6-9 (Thumb touch logic)
  if (t_p < 40 && index && middle && ring) return '6';
  if (t_r < 40 && index && middle && pinky) return '7';
  if (t_m < 40 && index && ring && pinky) return '8';
  if (t_i < 40 && middle && ring && pinky) return '9';

  // Words
  // if (!index && !middle && !ring && !pinky && thumb) return 'YES'; // Fist with thumb out
  // if (t_i < 50 && t_m < 50 && ring && pinky) return 'NO'; // Index/Middle snap to thumb
  if (index && middle && ring && pinky && thumb) return 'THANK YOU'; // Open palm
  if (!index && !middle && !ring && !pinky && !thumb) return 'SORRY'; // Closed fist

  // Special signs
  if (index && middle && !ring && !pinky) return 'PEACE';
  if (thumb && index && pinky && !middle && !ring) return 'LOVE';

  // OK (Index + Thumb circle, others up)
  // const tip8 = landmarkList[8];
  // const tip4 = landmarkList[4];
  // const dist84 = Math.sqrt((tip8[0] - tip4[0]) ** 2 + (tip8[1] - tip4[1]) ** 2);
  // if (dist84 < 40 && middle && ring && pinky) return 'OK';
  if (t_i < 40 && middle && ring && pinky) return 'OK'; // Same as 9

  return null;
}

/** 
 * Analyzes relationship between two detected hands.
 * Pass in [landmarksHand1, landmarksHand2]
 */
export function recognizeTwoHandGesture(hands) {
  if (!hands || hands.length < 2) return null;

  const h1 = hands[0];
  const h2 = hands[1];

  // Helper: Is a hand a fist?
  const isFist = (lms) => {
    const wrist = lms[0];
    const tips = [8, 12, 16, 20].map(i => lms[i]);
    // return tips.every(t => Math.sqrt((t[0]-wrist[0])**2 + (t[1]-wrist[1])**2) < 100);
    return tips.every(t => Math.sqrt((t[0] - wrist[0]) ** 2 + (t[1] - wrist[1]) ** 2) < 100);
  };

  // Helper: Is a hand a flat palm?
  const isPalm = (lms) => {
    const wrist = lms[0];
    const tips = [8, 12, 16, 20].map(i => lms[i]);
    // return tips.every(t => Math.sqrt((t[0]-wrist[0])**2 + (t[1]-wrist[1])**2) > 120);
    return tips.every(t => Math.sqrt((t[0] - wrist[0]) ** 2 + (t[1] - wrist[1]) ** 2) > 120);
  };

  const center1 = h1[9]; // Middle MCP as center
  const center2 = h2[9];
  // const dist = Math.sqrt((center1[0]-center2[0])**2 + (center1[1]-center2[1])**2);
  const dist = Math.sqrt((center1[0] - center2[0]) ** 2 + (center1[1] - center2[1]) ** 2);

  // 1. HELP (Fist on top of Palm)
  const fistIdx = isFist(h1) ? 0 : (isFist(h2) ? 1 : -1);
  const palmIdx = isPalm(h1) ? 0 : (isPalm(h2) ? 1 : -1);

  if (fistIdx !== -1 && palmIdx !== -1 && dist < 150) {
    const fistY = hands[fistIdx][0][1];
    const palmY = hands[palmIdx][0][1];
    if (fistY < palmY) return 'HELP'; // Fist is physically higher
  }

  // 2. MORE (Two pinched/flat hands touching)
  if (dist < 80 && !isPalm(h1) && !isPalm(h2)) {
    return 'MORE';
  }

  return null;
}
