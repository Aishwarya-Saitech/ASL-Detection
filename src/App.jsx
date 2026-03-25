/**
 * App.jsx — Root application component
 * Production-ready ASL Hand Gesture Recognition
 * Ported from Python (app.py) to React + MediaPipe Hands + TFLite
 */
import { useState } from 'react';
import ASLDetector from './components/ASLDetector';
import SignReference from './components/SignReference';
import './App.css';

export default function App() {
  const [activeSign, setActiveSign] = useState(null);
  const [showReference, setShowReference] = useState(false);

  return (
    <div className="app">
      {/* ── Global background ── */}
      <div className="bg-gradient" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      {/* ── Top Nav ── */}
      <header className="app-header" role="banner">
        <div className="header-brand">
          <div className="brand-icon" aria-hidden="true">✨</div>
          <div className="brand-text">
            <h1 className="brand-name">SignLens AI</h1>
            <p className="brand-tagline">Real-time ASL · Intelligent Recognition</p>
          </div>
        </div>
        <nav className="header-nav">
          <button
            id="btn-toggle-reference"
            className={`nav-btn ${showReference ? 'nav-btn--active' : ''}`}
            onClick={() => setShowReference((v) => !v)}
            aria-pressed={showReference}
          >
            📚 {showReference ? 'Hide' : 'Show'} Reference
          </button>
          {/*   <a
            href="https://github.com/AkramOM606/American-Sign-Language-Detection"
            target="_blank"
            rel="noreferrer"
            className="nav-btn"
            id="link-github"
          >
            ⭐ GitHub
          </a> */}
        </nav>
      </header>

      {/* ── Main content ── */}
      <main className="app-main" role="main">
        {/* Detection column */}
        <section className="detector-col" aria-label="ASL detection camera">
          <ASLDetector onDetection={setActiveSign} />
        </section>

        {/* Reference panel (collapsible) */}
        {showReference && (
          <section className="reference-col" aria-label="ASL alphabet reference">
            <SignReference activeSign={activeSign} />
          </section>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer" role="contentinfo">
        <p>
          Built with{' '}
          <a href="https://react.dev" target="_blank" rel="noreferrer">React</a>
          {' · '}
          <a href="https://mediapipe.dev" target="_blank" rel="noreferrer">MediaPipe Hands</a>
          {' · '}
          <a href="https://www.tensorflow.org/js" target="_blank" rel="noreferrer">TensorFlow.js</a>
          {/* {' · '}
          Ported from <a href="https://github.com/AkramOM606/American-Sign-Language-Detection" target="_blank" rel="noreferrer">Python</a> */}
        </p>
      </footer>
    </div>
  );
}
