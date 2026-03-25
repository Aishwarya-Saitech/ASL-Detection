import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from Vite's 'dist' directory after build
app.use(express.static(path.join(__dirname, 'dist')));

app.use(cors());
app.use(express.json());

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

    // Auto-limit history to 100 items
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
  // Simple static dictionary for production readiness
  const dictionary = [
    "HELLO", "HELP", "THANKYOU", "PLEASE", "YES", "NO", "LOVE", "PEACE",
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"
  ];
  res.json(dictionary);
});

// ── Catch-all: Route all other requests to index.html (SPA support) ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[SignLens] Running at port ${PORT}`);
});
