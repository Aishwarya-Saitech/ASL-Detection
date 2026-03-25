import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Render sets the PORT environment variable. If not set, it defaults to 5000 for local testing.
const PORT = process.env.PORT || 5000;

// Add COOP/COEP headers required for MediaPipe/TFLite (SharedArrayBuffer)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(cors());
app.use(express.json());

// Serve static files from Vite's 'dist' directory after build
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

const HISTORY_FILE = path.join(__dirname, 'history.json');

// Initialize history file if not exists
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

// ── GET History ──
app.get('/api/history', (req, res) => {
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read history' });
  }
});

// ── POST New Detection ──
app.post('/api/history', (req, res) => {
  const { sign, timestamp } = req.body;
  if (!sign) return res.status(400).json({ error: 'Missing sign data' });

  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const history = JSON.parse(data);

    const newEntry = { sign, timestamp: timestamp || new Date().toISOString() };
    const newHistory = [newEntry, ...history].slice(0, 100);

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(newHistory, null, 2));
    res.json(newEntry);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save history' });
  }
});

// ── GET Dictionary ──
app.get('/api/dictionary', (req, res) => {
  const dictionary = [
    "HELLO", "HELP", "THANKYOU", "PLEASE", "YES", "NO", "LOVE", "PEACE",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
  ];
  res.json(dictionary);
});

// ── Health Check ──
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ── Catch-all: Route all other requests to index.html (SPA support) ──
app.get('*', (req, res) => {
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send('Build files not found. Ensure "npm run build" was executed.');
  }
});

// Bind to 0.0.0.0 to ensure it is accessible on Render's network
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SignLens] Production server is running!`);
  console.log(`- Port: ${PORT}`);
  console.log(`- Assets: ${distPath}`);
});
