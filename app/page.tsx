"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PositionIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type Stimulus = {
  position: PositionIndex;
  letter: string; // single uppercase letter
};

type TrialResult = {
  index: number;
  isPositionMatch: boolean;
  isAudioMatch: boolean;
  positionResponse: boolean; // whether user indicated position match
  audioResponse: boolean; // whether user indicated audio match
  positionCorrect: boolean;
  audioCorrect: boolean;
};

const LETTERS = [
  "C",
  "H",
  "K",
  "L",
  "Q",
  "R",
  "S",
  "T",
  "V",
];

function getRandomLetter(): string {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function getRandomPosition(): PositionIndex {
  return Math.floor(Math.random() * 9) as PositionIndex;
}

function speakLetter(letter: string, enabled: boolean) {
  if (!enabled) return;
  try {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utter = new SpeechSynthesisUtterance(letter);
    utter.rate = 0.9;
    utter.pitch = 1.05;
    utter.lang = "en-US";
    synth.cancel();
    synth.speak(utter);
  } catch {
    // noop: best-effort speech only
  }
}

export default function Page() {
  const [n, setN] = useState<number>(2);
  const [blockLength, setBlockLength] = useState<number>(20);
  const [intervalMs, setIntervalMs] = useState<number>(2500);
  const [running, setRunning] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [sequence, setSequence] = useState<Stimulus[]>([]);
  const [results, setResults] = useState<TrialResult[]>([]);
  const [highlightIndex, setHighlightIndex] = useState<PositionIndex | null>(null);
  const [showLetter, setShowLetter] = useState<string>("");
  const [speechOn, setSpeechOn] = useState<boolean>(true);

  const pressedThisTrial = useRef<{ pos: boolean; audio: boolean }>({ pos: false, audio: false });
  const timerRef = useRef<number | null>(null);

  const accuracy = useMemo(() => {
    const totalAudio = results.filter(r => r.index >= n).length;
    const audioCorrect = results.filter(r => r.index >= n && r.audioCorrect).length;
    const totalPos = totalAudio;
    const posCorrect = results.filter(r => r.index >= n && r.positionCorrect).length;
    const accAudio = totalAudio ? Math.round((audioCorrect / totalAudio) * 100) : 0;
    const accPos = totalPos ? Math.round((posCorrect / totalPos) * 100) : 0;
    return { accAudio, accPos };
  }, [results, n]);

  const resetState = useCallback(() => {
    setCurrentIndex(-1);
    setSequence([]);
    setResults([]);
    setHighlightIndex(null);
    setShowLetter("");
    pressedThisTrial.current = { pos: false, audio: false };
  }, []);

  const startBlock = useCallback(() => {
    resetState();
    // generate initial sequence; allow natural matches
    const seq: Stimulus[] = Array.from({ length: blockLength }).map(() => ({
      position: getRandomPosition(),
      letter: getRandomLetter(),
    }));
    setSequence(seq);
    setRunning(true);
  }, [blockLength, resetState]);

  const stopBlock = useCallback(() => {
    setRunning(false);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // drive trial loop
  useEffect(() => {
    if (!running) return;

    function runTrial(nextIndex: number) {
      if (nextIndex >= blockLength) {
        stopBlock();
        return;
      }
      setCurrentIndex(nextIndex);
      pressedThisTrial.current = { pos: false, audio: false };
      const stim = sequence[nextIndex] ?? { position: getRandomPosition(), letter: getRandomLetter() };

      // present visual + audio
      setHighlightIndex(stim.position);
      setShowLetter(stim.letter);
      speakLetter(stim.letter, speechOn);

      // clear highlight before next trial by 30% of interval for a brief ISI
      const isi = Math.max(150, Math.floor(intervalMs * 0.3));
      const presentDuration = Math.max(200, intervalMs - isi);

      window.setTimeout(() => {
        setHighlightIndex(null);
        setShowLetter("");
      }, presentDuration - 50);

      // schedule scoring at end of interval
      timerRef.current = window.setTimeout(() => {
        // compute matches
        const compareIndex = nextIndex - n;
        const isPositionMatch = compareIndex >= 0 && sequence[compareIndex]?.position === stim.position;
        const isAudioMatch = compareIndex >= 0 && sequence[compareIndex]?.letter === stim.letter;

        const positionResponse = pressedThisTrial.current.pos;
        const audioResponse = pressedThisTrial.current.audio;

        const positionCorrect = isPositionMatch === positionResponse;
        const audioCorrect = isAudioMatch === audioResponse;

        setResults(prev => [
          ...prev,
          {
            index: nextIndex,
            isPositionMatch,
            isAudioMatch,
            positionResponse,
            audioResponse,
            positionCorrect,
            audioCorrect,
          },
        ]);

        runTrial(nextIndex + 1);
      }, intervalMs) as unknown as number;
    }

    runTrial(0);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [running, intervalMs, n, sequence, speechOn, blockLength, stopBlock]);

  // keyboard handlers
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!running) return;
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === "a") {
        pressedThisTrial.current.audio = true;
      } else if (key === "l") {
        pressedThisTrial.current.pos = true;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running]);

  const inPractice = currentIndex >= 0 && currentIndex < n;

  const totals = useMemo(() => {
    // count only trials where matching is defined (index >= n)
    const eligible = results.filter(r => r.index >= n);
    const posCorrect = eligible.filter(r => r.positionCorrect).length;
    const audioCorrect = eligible.filter(r => r.audioCorrect).length;

    const posMatches = eligible.filter(r => r.isPositionMatch).length;
    const audioMatches = eligible.filter(r => r.isAudioMatch).length;

    const posResponses = eligible.filter(r => r.positionResponse).length;
    const audioResponses = eligible.filter(r => r.audioResponse).length;

    return { posCorrect, audioCorrect, posMatches, audioMatches, posResponses, audioResponses, eligible: eligible.length };
  }, [results, n]);

  const canStart = !running;

  return (
    <div className="container">
      <div className="header">
        <div className="h1">Dual N-Back Trainer</div>
        <div className="controls">
          <button className="secondary" onClick={resetState} disabled={running}>Reset</button>
          {canStart ? (
            <button className="primary" onClick={startBlock}>Start</button>
          ) : (
            <button className="secondary" onClick={stopBlock}>Stop</button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label>N-back</label>
            <input type="number" min={1} max={8} value={n} onChange={(e) => setN(Math.max(1, Math.min(8, Number(e.target.value))))} disabled={running} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <label>Block length</label>
            <input type="number" min={10} max={100} value={blockLength} onChange={(e) => setBlockLength(Math.max(10, Math.min(100, Number(e.target.value))))} disabled={running} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <label>Interval (ms)</label>
            <input type="number" step={100} min={1200} max={5000} value={intervalMs} onChange={(e) => setIntervalMs(Math.max(1200, Math.min(5000, Number(e.target.value))))} disabled={running} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <label>Speech</label>
            <select value={speechOn ? 'on' : 'off'} onChange={(e) => setSpeechOn(e.target.value === 'on')} disabled={running}>
              <option value="on">On (Web Speech)</option>
              <option value="off">Off</option>
            </select>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <strong>Controls</strong>
            </div>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <button className="primary" onClick={() => (pressedThisTrial.current.audio = true)} disabled={!running}>
              Audio match <span style={{ marginLeft: 8 }}><kbd>A</kbd></span>
            </button>
            <button className="primary" onClick={() => (pressedThisTrial.current.pos = true)} disabled={!running}>
              Position match <span style={{ marginLeft: 8 }}><kbd>L</kbd></span>
            </button>
          </div>
          <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
            Press when the current letter or square matches the one from N trials ago.
            {inPractice && (
              <div style={{ marginTop: 4, color: '#7a88b4' }}>
                Practice period: scoring starts after the first {n} trials.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="stats">
            <div className="stat">
              <div>Audio accuracy</div>
              <div className="v">{accuracy.accAudio}%</div>
            </div>
            <div className="stat">
              <div>Position accuracy</div>
              <div className="v">{accuracy.accPos}%</div>
            </div>
            <div className="stat">
              <div>Audio responses</div>
              <div className="v">{totals.audioResponses}</div>
            </div>
            <div className="stat">
              <div>Position responses</div>
              <div className="v">{totals.posResponses}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="grid">
          {Array.from({ length: 9 }).map((_, i) => {
            const active = highlightIndex === (i as PositionIndex);
            return (
              <div key={i} className={`cell${active ? ' active' : ''}`}>
                {active && <span className="letter">{showLetter}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {(!running && results.length > 0) && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>Block summary</strong>
          <div style={{ marginTop: 8 }}>
            <div>Trials scored: {totals.eligible}</div>
            <div>Audio: {totals.audioCorrect} correct of {totals.eligible} ({accuracy.accAudio}%)</div>
            <div>Position: {totals.posCorrect} correct of {totals.eligible} ({accuracy.accPos}%)</div>
            <div style={{ marginTop: 8, opacity: 0.8 }}>
              Matches occurred ? Audio: {totals.audioMatches}, Position: {totals.posMatches} (includes practice trials)
            </div>
          </div>
        </div>
      )}

      <footer>
        Inspired by Brain Workshop. Built for the web.
      </footer>
    </div>
  );
}
