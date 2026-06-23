import React, { useState, useRef, useEffect } from "react";

const ROLES = [
  { id: "sde", label: "Software Engineer", icon: "{ }" },
  { id: "pm", label: "Product Manager", icon: "▣" },
  { id: "ds", label: "Data Analyst", icon: "▤" },
  { id: "mkt", label: "Marketing", icon: "◈" },
  { id: "sales", label: "Sales", icon: "◆" },
  { id: "hr", label: "HR / People", icon: "○" },
];

const QUESTION_BANK = {
  sde: [
    "Walk me through a project you're proud of. What was your specific contribution?",
    "Tell me about a time you disagreed with a teammate's technical decision. What did you do?",
    "How do you approach debugging a problem you've never seen before?",
    "Describe a time you had to learn a new technology quickly to finish a task.",
    "What's a mistake you made in a past project, and what did you change afterward?",
  ],
  pm: [
    "Tell me about a product decision you made with incomplete data.",
    "Describe a time you had to say no to a stakeholder. How did you handle it?",
    "Walk me through how you'd prioritize a backlog with three competing urgent requests.",
    "Tell me about a time a launch didn't go as planned. What happened?",
    "How do you decide whether a feature request is worth building?",
  ],
  ds: [
    "Tell me about a time your analysis changed someone's mind on a decision.",
    "Describe a project where the data didn't say what you expected. What did you do?",
    "How do you explain a complex finding to someone non-technical?",
    "Tell me about a time you had messy or incomplete data. How did you handle it?",
    "Walk me through how you'd validate that a metric is trustworthy.",
  ],
  mkt: [
    "Tell me about a campaign that underperformed. What did you learn?",
    "How do you decide which channel to invest budget in?",
    "Describe a time you had to make a case for a creative idea that others doubted.",
    "Walk me through how you'd position a product against a stronger competitor.",
    "Tell me about a time you used data to change a marketing decision.",
  ],
  sales: [
    "Tell me about the toughest deal you've closed. What made it hard?",
    "Describe a time a prospect said no. What did you do next?",
    "How do you handle a client who keeps pushing back on price?",
    "Walk me through how you qualify whether a lead is worth pursuing.",
    "Tell me about a time you lost a deal. What would you do differently?",
  ],
  hr: [
    "Tell me about a time you had to deliver difficult feedback.",
    "Describe how you handled a conflict between two team members.",
    "How do you approach building trust with a new team quickly?",
    "Tell me about a time a hiring decision didn't work out. What did you learn?",
    "Walk me through how you'd handle a manager who's losing their team's trust.",
  ],
};

// Local fallback scorer — used only if the AI call fails (offline, rate limit, etc).
function localFallbackScore(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const fillers = ["um", "uh", "like", "basically", "actually", "sort of", "kind of"];
  const lower = text.toLowerCase();
  const fillerCount = fillers.reduce((acc, f) => acc + (lower.split(f).length - 1), 0);
  const hasResult = /\b(result|led to|increased|reduced|improved|achieved|so we|ended up|outcome|impact)\b/i.test(text);
  const hasStructure = /\b(first|then|after that|eventually|finally|because|so that)\b/i.test(text);

  let clarity = wc > 25 ? 65 : 45;
  let confidence = fillerCount === 0 ? 65 : 50;
  let relevance = hasResult ? 70 : 50;
  if (hasStructure) relevance += 10;
  if (wc < 15) { clarity -= 15; confidence -= 15; relevance -= 15; }

  clarity = Math.max(10, Math.min(95, clarity));
  confidence = Math.max(10, Math.min(95, confidence));
  relevance = Math.max(10, Math.min(95, relevance));
  const overall = Math.round((clarity + confidence + relevance) / 3);

  const notes = [];
  if (wc < 15) notes.push("Your answer is quite short — try expanding with a specific example.");
  if (fillerCount > 2) notes.push(`Watch filler words — noticed ${fillerCount} (um, like, basically...).`);
  if (!hasResult) notes.push("Add a concrete result or outcome to make the answer land.");
  if (notes.length === 0) notes.push("Solid structure and a clear outcome — this is interview-ready.");

  return { clarity, confidence, relevance, overall, notes, wc, fillerCount, source: "offline" };
}

async function scoreAnswer(question, text, roleLabel) {
  // For now, use the local offline scorer as the primary source.
  // This keeps the app working without an external AI API key.
  try {
    return localFallbackScore(text);
  } catch (e) {
    return localFallbackScore(text);
  }
}

function ScoreBar({ label, value, color }) {
  return (
    <div className="score-row">
      <div className="score-label">{label}</div>
      <div className="score-track">
        <div className="score-fill" style={{ width: `${value}%`, background: color }} />
      </div>
      <div className="score-value" style={{ color }}>{value}</div>
    </div>
  );
}

export default function InterviewCoach() {
  const [stage, setStage] = useState("setup"); // setup | session | summary
  const [role, setRole] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentScore, setCurrentScore] = useState(null);
  const [phase, setPhase] = useState("answering"); // answering | feedback
  const timerRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  useEffect(() => {
    if (stage === "session" && phase === "answering" && textRef.current) {
      textRef.current.focus();
    }
  }, [qIndex, phase, stage]);

  function startSession(roleId) {
    setRole(roleId);
    setQIndex(0);
    setHistory([]);
    setAnswer("");
    setSeconds(0);
    setRunning(true);
    setPhase("answering");
    setStage("session");
  }

  function submitAnswer() {
    if (!answer.trim()) return;
    setRunning(false);
    setPhase("scoring");
    const roleLabel = ROLES.find((r) => r.id === role)?.label || "this";
    scoreAnswer(currentQuestion, answer, roleLabel).then((result) => {
      setCurrentScore(result);
      setPhase("feedback");
    });
  }

  function nextQuestion() {
    const questions = QUESTION_BANK[role];
    const record = {
      question: questions[qIndex],
      answer,
      score: currentScore,
    };
    const newHistory = [...history, record];
    setHistory(newHistory);

    if (qIndex + 1 >= questions.length) {
      setStage("summary");
    } else {
      setQIndex(qIndex + 1);
      setAnswer("");
      setSeconds(0);
      setRunning(true);
      setPhase("answering");
    }
  }

  function reset() {
    setStage("setup");
    setRole(null);
    setHistory([]);
    setAnswer("");
    setSeconds(0);
    setCurrentScore(null);
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  }

  const questions = role ? QUESTION_BANK[role] : [];
  const currentQuestion = questions[qIndex];

  const avgOverall =
    history.length > 0
      ? Math.round(
          history.reduce((a, h) => a + h.score.overall, 0) / history.length
        )
      : 0;

  return (
    <div className="ic-root">
      <style>{`
        .ic-root {
          --ink: #1A1F2E;
          --paper: #F7F5F0;
          --paper-dim: #ECE8DF;
          --amber: #E8A33D;
          --amber-dim: #C98A2E;
          --sage: #7C9885;
          --coral: #D97757;
          --line: rgba(247,245,240,0.12);
          --line-dark: rgba(26,31,46,0.10);
          font-family: 'IC-Body', system-ui, -apple-system, sans-serif;
          background: var(--ink);
          color: var(--paper);
          min-height: 100%;
          padding: 0;
          box-sizing: border-box;
        }
        .ic-root *, .ic-root *::before, .ic-root *::after { box-sizing: border-box; }
        .ic-root .display {
          font-family: 'IC-Display', Georgia, serif;
        }
        .ic-root .mono {
          font-family: 'IC-Mono', 'SF Mono', Consolas, monospace;
        }

        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        .ic-root { }
        .ic-root .display { font-family: 'Fraunces', Georgia, serif; }
        .ic-root .body-font { font-family: 'Inter', system-ui, sans-serif; }
        .ic-root .mono { font-family: 'JetBrains Mono', monospace; }
        .ic-root { font-family: 'Inter', system-ui, sans-serif; }

        .ic-wrap {
          max-width: 720px;
          margin: 0 auto;
          padding: 48px 24px 64px;
        }

        .ic-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 40px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 20px;
        }
        .ic-brand {
          font-size: 15px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--amber);
          font-weight: 600;
        }
        .ic-tag {
          font-size: 12px;
          color: rgba(247,245,240,0.45);
          letter-spacing: 0.02em;
        }

        /* SETUP */
        .ic-hero h1 {
          font-size: 42px;
          line-height: 1.1;
          margin: 0 0 14px;
          font-weight: 500;
          letter-spacing: -0.01em;
        }
        .ic-hero p {
          font-size: 16px;
          color: rgba(247,245,240,0.65);
          line-height: 1.6;
          margin: 0 0 36px;
          max-width: 480px;
        }
        .role-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1px;
          background: var(--line);
          border: 1px solid var(--line);
        }
        .role-card {
          background: var(--ink);
          padding: 22px 20px;
          cursor: pointer;
          transition: background 0.15s ease;
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: left;
          border: none;
          color: var(--paper);
          font-family: inherit;
        }
        .role-card:hover {
          background: rgba(232,163,61,0.08);
        }
        .role-card:focus-visible {
          outline: 2px solid var(--amber);
          outline-offset: -2px;
          z-index: 1;
        }
        .role-icon {
          font-family: 'JetBrains Mono', monospace;
          font-size: 18px;
          color: var(--amber);
        }
        .role-name {
          font-size: 16px;
          font-weight: 500;
        }
        .role-meta {
          font-size: 12px;
          color: rgba(247,245,240,0.4);
        }

        /* SESSION */
        .session-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }
        .q-progress {
          font-size: 13px;
          color: rgba(247,245,240,0.5);
          letter-spacing: 0.03em;
        }
        .q-progress b { color: var(--paper); }
        .timer {
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          color: var(--amber);
          background: rgba(232,163,61,0.1);
          padding: 5px 12px;
          border-radius: 3px;
        }

        .q-card {
          background: var(--paper);
          color: var(--ink);
          border-radius: 4px;
          padding: 36px 32px;
          margin-bottom: 24px;
          position: relative;
        }
        .q-card::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--amber);
          border-radius: 4px 0 0 4px;
        }
        .q-label {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--amber-dim);
          font-weight: 700;
          margin-bottom: 14px;
        }
        .q-text {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 24px;
          line-height: 1.4;
          font-weight: 500;
        }

        textarea.ic-input {
          width: 100%;
          background: rgba(247,245,240,0.04);
          border: 1px solid var(--line);
          border-radius: 4px;
          color: var(--paper);
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          line-height: 1.6;
          padding: 18px;
          resize: vertical;
          min-height: 140px;
          transition: border-color 0.15s ease;
        }
        textarea.ic-input::placeholder { color: rgba(247,245,240,0.3); }
        textarea.ic-input:focus {
          outline: none;
          border-color: var(--amber);
        }

        .row-between {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
        }
        .wc-hint {
          font-size: 12px;
          color: rgba(247,245,240,0.4);
          font-family: 'JetBrains Mono', monospace;
        }

        .btn {
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 600;
          padding: 12px 24px;
          border-radius: 3px;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.1s ease;
        }
        .btn:active { transform: scale(0.98); }
        .btn-primary {
          background: var(--amber);
          color: var(--ink);
        }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .btn-ghost {
          background: transparent;
          color: var(--paper);
          border: 1px solid var(--line);
        }
        .btn-ghost:hover { border-color: rgba(247,245,240,0.4); }
        .btn:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

        /* FEEDBACK */
        .feedback-panel {
          background: var(--paper-dim);
          color: var(--ink);
          border-radius: 4px;
          padding: 28px 32px;
          margin-top: 4px;
          animation: slideUp 0.35s ease;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fb-overall {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 22px;
        }
        .fb-overall .num {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 44px;
          font-weight: 600;
          line-height: 1;
        }
        .fb-overall .lbl {
          font-size: 13px;
          color: rgba(26,31,46,0.55);
          letter-spacing: 0.03em;
        }
        .score-row {
          display: grid;
          grid-template-columns: 90px 1fr 36px;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .score-label {
          font-size: 12px;
          color: rgba(26,31,46,0.6);
        }
        .score-track {
          height: 6px;
          background: rgba(26,31,46,0.1);
          border-radius: 3px;
          overflow: hidden;
        }
        .score-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.5s ease;
        }
        .score-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          text-align: right;
        }
        .fb-notes {
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid rgba(26,31,46,0.1);
        }
        .fb-notes ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .fb-notes li {
          font-size: 14px;
          line-height: 1.5;
          padding-left: 18px;
          position: relative;
          margin-bottom: 8px;
          color: rgba(26,31,46,0.8);
        }
        .fb-notes li::before {
          content: '—';
          position: absolute;
          left: 0;
          color: var(--coral);
        }
        .fb-actions { margin-top: 22px; display: flex; justify-content: flex-end; }

        .scoring-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 36px 32px;
        }
        .scoring-dots {
          display: flex;
          gap: 6px;
        }
        .scoring-dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--coral);
          animation: bounce 1.2s infinite ease-in-out;
        }
        .scoring-dots span:nth-child(2) { animation-delay: 0.15s; }
        .scoring-dots span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        .scoring-text {
          font-size: 13px;
          color: rgba(26,31,46,0.55);
        }
        @media (prefers-reduced-motion: reduce) {
          .scoring-dots span { animation: none; opacity: 0.8; }
        }

        /* SUMMARY */
        .summary-score {
          text-align: center;
          padding: 40px 0 32px;
          border-bottom: 1px solid var(--line);
          margin-bottom: 32px;
        }
        .summary-score .num {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 72px;
          font-weight: 600;
          color: var(--amber);
          line-height: 1;
        }
        .summary-score .label {
          font-size: 13px;
          color: rgba(247,245,240,0.5);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-top: 8px;
        }
        .qa-item {
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 20px 22px;
          margin-bottom: 14px;
        }
        .qa-q {
          font-size: 14px;
          color: rgba(247,245,240,0.85);
          margin-bottom: 6px;
          font-weight: 500;
        }
        .qa-score {
          display: inline-block;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 3px;
          margin-top: 8px;
        }
        .summary-actions {
          display: flex;
          gap: 12px;
          margin-top: 32px;
          justify-content: center;
        }

        @media (max-width: 600px) {
          .ic-wrap { padding: 32px 16px 48px; }
          .ic-hero h1 { font-size: 32px; }
          .role-grid { grid-template-columns: 1fr; }
          .q-card { padding: 26px 22px; }
          .q-text { font-size: 20px; }
          .score-row { grid-template-columns: 70px 1fr 32px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .feedback-panel { animation: none; }
          .score-fill { transition: none; }
        }
      `}</style>

      <div className="ic-wrap">
        <div className="ic-header">
          <span className="ic-brand">InterviewCoach</span>
          <span className="ic-tag mono">{stage === "session" ? `Round ${qIndex + 1} / ${questions.length}` : "Mock interview practice"}</span>
        </div>

        {stage === "setup" && (
          <div className="ic-hero">
            <h1 className="display">Practice the interview<br />before it's real.</h1>
            <p>Pick a role. Answer five questions, one at a time, in your own words. Get scored on clarity, confidence, and relevance after each one — then see where you stand.</p>
            <div className="role-grid">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  className="role-card"
                  onClick={() => startSession(r.id)}
                >
                  <span className="role-icon">{r.icon}</span>
                  <span className="role-name">{r.label}</span>
                  <span className="role-meta">5 questions · ~10 min</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "session" && currentQuestion && (
          <div>
            <div className="session-meta">
              <div className="q-progress">
                <b>{ROLES.find((r) => r.id === role)?.label}</b> interview
              </div>
              <div className="timer mono">{fmtTime(seconds)}</div>
            </div>

            <div className="q-card">
              <div className="q-label">Question {qIndex + 1}</div>
              <div className="q-text">{currentQuestion}</div>
            </div>

            {phase === "answering" && (
              <div>
                <textarea
                  ref={textRef}
                  className="ic-input"
                  placeholder="Speak it out loud first, then type your answer here..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <div className="row-between">
                  <span className="wc-hint">{answer.trim() ? answer.trim().split(/\s+/).length : 0} words</span>
                  <button
                    className="btn btn-primary"
                    onClick={submitAnswer}
                    disabled={!answer.trim()}
                  >
                    Get feedback
                  </button>
                </div>
              </div>
            )}

            {phase === "scoring" && (
              <div className="feedback-panel scoring-panel">
                <div className="scoring-dots">
                  <span></span><span></span><span></span>
                </div>
                <div className="scoring-text">Reading your answer like an interviewer would...</div>
              </div>
            )}

            {phase === "feedback" && currentScore && (
              <div className="feedback-panel">
                <div className="fb-overall">
                  <span className="num">{currentScore.overall}</span>
                  <span className="lbl">/ 100 overall</span>
                </div>
                <ScoreBar label="Clarity" value={currentScore.clarity} color="#7C9885" />
                <ScoreBar label="Confidence" value={currentScore.confidence} color="#E8A33D" />
                <ScoreBar label="Relevance" value={currentScore.relevance} color="#D97757" />
                <div className="fb-notes">
                  <ul>
                    {currentScore.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
                <div className="fb-actions">
                  <button className="btn btn-primary" onClick={nextQuestion}>
                    {qIndex + 1 >= questions.length ? "See summary" : "Next question"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {stage === "summary" && (
          <div>
            <div className="summary-score">
              <div className="num display">{avgOverall}</div>
              <div className="label">Average score across {history.length} questions</div>
            </div>

            {history.map((h, i) => (
              <div className="qa-item" key={i}>
                <div className="qa-q">{i + 1}. {h.question}</div>
                <span
                  className="qa-score mono"
                  style={{
                    background:
                      h.score.overall >= 70
                        ? "rgba(124,152,133,0.15)"
                        : h.score.overall >= 50
                        ? "rgba(232,163,61,0.15)"
                        : "rgba(217,119,87,0.15)",
                    color:
                      h.score.overall >= 70
                        ? "#7C9885"
                        : h.score.overall >= 50
                        ? "#E8A33D"
                        : "#D97757",
                  }}
                >
                  {h.score.overall} / 100
                </span>
              </div>
            ))}

            <div className="summary-actions">
              <button className="btn btn-ghost" onClick={() => startSession(role)}>
                Retry this role
              </button>
              <button className="btn btn-primary" onClick={reset}>
                Try a different role
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}