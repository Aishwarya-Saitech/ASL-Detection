import { useState } from 'react';
import './SignReference.css';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const NUMBERS = '0123456789'.split('');

const ALPHABET_HINTS = {
  A: 'Fist, thumb up', B: 'Flat hand, thumb in', C: 'Curved C-shape', D: 'Finger + thumb circle',
  E: 'Bent fingers', F: 'OK sign variation', G: 'Point to side', H: 'Two fingers sideways',
  I: 'Pinky up', J: 'Pinky + arc', K: 'Index + middle up', L: 'L-shape',
  M: 'Three fingers over thumb', N: 'Two fingers over thumb', O: 'O-shape', P: 'K downward',
  Q: 'G downward', R: 'Crossed fingers', S: 'Fist over thumb', T: 'Thumb between fingers',
  U: 'Two fingers together', V: 'Peace sign', W: 'Three fingers up', X: 'Index hook',
  Y: 'Pinky + thumb out', Z: 'Z in air'
};

const NUMBER_HINTS = {
  0: 'Fingers + thumb in O-shape',
  1: 'Pointer finger up',
  2: 'Pointer + middle up (V)',
  3: 'Thumb + pointer + middle up',
  4: 'Four fingers up',
  5: 'Open hand',
  6: 'Thumb touches pinky',
  7: 'Thumb touches ring finger',
  8: 'Thumb touches middle finger',
  9: 'Thumb touches index finger'
};

export default function SignReference({ activeSign }) {
  const [view, setView] = useState('ALPHA'); // ALPHA, NUMS
  const [showChart, setShowChart] = useState(true);

  const currentChart = view === 'ALPHA'
    ? '/ASL_Alphabet.jpg'
    : '/How-to-Count-in-Sign-Language.jpg';

  const currentList = view === 'ALPHA' ? ALPHABET : NUMBERS;
  const currentHints = view === 'ALPHA' ? ALPHABET_HINTS : NUMBER_HINTS;

  return (
    <div className="sign-reference">
      <div className="ref-header">
        <div className="ref-header-top">
          <div className="ref-title-group">
            <h3>Sign Lexicon</h3>
            <span className="ref-sub">Visual AI Reference</span>
          </div>
          <div className="ref-tabs">
            <button
              className={`ref-tab-btn ${view === 'ALPHA' ? 'active' : ''}`}
              onClick={() => setView('ALPHA')}
            >
              A-Z
            </button>
            <button
              className={`ref-tab-btn ${view === 'NUMS' ? 'active' : ''}`}
              onClick={() => setView('NUMS')}
            >
              0-9
            </button>
          </div>
        </div>
        <div className="ref-toggle-row">
          <button
            className={`ref-sub-toggle ${showChart ? 'active' : ''}`}
            onClick={() => setShowChart(true)}
          >
            🖼️ Chart View
          </button>
          <button
            className={`ref-sub-toggle ${!showChart ? 'active' : ''}`}
            onClick={() => setShowChart(false)}
          >
            🎴 Cards View
          </button>
        </div>
      </div>

      {showChart ? (
        <div className="ref-chart-container animate-fade-in">
          <img src={currentChart} alt={`${view} Chart`} className="ref-chart-img" />
        </div>
      ) : (
        <div className="ref-grid animate-fade-in">
          {currentList.map((char) => (
            <div
              key={char}
              className={`ref-card ${activeSign === char ? 'ref-card--active' : ''}`}
              title={currentHints[char]}
            >
              <span className="ref-letter">{char}</span>
              <span className="ref-hint">{currentHints[char]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
