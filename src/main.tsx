import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockMath, InlineMath } from 'react-katex';
import { ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, FileUp, Menu, RotateCcw, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import './styles.css';

type Question = { prompt: string; options: string[]; correctAnswer: string; skill?: string; difficulty?: string };
type Attempt = { prompt: string; question: Question; choice: string; reasoning: string; feedback: string; isCorrect: boolean | null; skill?: string; time: number };
type LearnerState = { theorem?: string; problemId?: string; phase?: string; currentQuestion?: Question; history?: Attempt[]; mode?: 'guided' | 'repetition'; diagnosticsCount?: number; awaitingSillyMistake?: boolean; feedback?: string; explanation?: string; verdict?: boolean | null; diagnosedSkill?: string; orientation?: { comfort?: string; graphs?: string }; lastQuestion?: Question };

const API_URL = (import.meta.env.VITE_API_URL || 'https://proofwise-api.irtiza-proofwise.workers.dev').replace(/\/$/, '');
const ACTIVE_PROFILE_KEY = 'math-mastery-anonymous-profile';
const RECENT_STARTS_KEY = 'math-mastery-recent-starts';
const profileKey = (id: string) => `math-mastery-progress-${id}`;
const starters = [
  { id: 'cauchy-subsequence', title: 'A Cauchy sequence and a subsequence', topic: 'Sequences · Standard', theorem: 'Let $(x_n)$ be a Cauchy sequence in a metric space $(X,d)$. If a subsequence $(x_{n_k})$ converges to $x\in X$, prove that $x_n\to x$.' },
  { id: 'continuous-sequences', title: 'Continuity and convergent sequences', topic: 'Continuity · Standard', theorem: 'Let $f:X\to Y$ be continuous at $a\in X$, where $X$ and $Y$ are metric spaces. Prove that whenever $x_n\to a$, we have $f(x_n)\to f(a)$.' },
  { id: 'compact-image', title: 'The continuous image of a compact set', topic: 'Compactness · Challenge', theorem: 'Let $X$ and $Y$ be metric spaces, let $K\subseteq X$ be compact, and let $f:X\to Y$ be continuous. Prove that $f(K)$ is compact.' },
  { id: 'fixed-point', title: 'A fixed point on a closed interval', topic: 'Continuity · Challenge', theorem: 'Let $f:[a,b]\to[a,b]$ be continuous. Prove that there exists $c\in[a,b]$ such that $f(c)=c$.' },
  { id: 'closure-open', title: 'Characterizing closure with open balls', topic: 'Metric spaces · Foundation', theorem: 'Let $(X,d)$ be a metric space and $A\subseteq X$. Prove that $x\in\overline{A}$ if and only if every open ball centered at $x$ intersects $A$.' },
  { id: 'connected-real', title: 'Connected subsets of the real line', topic: 'Connectedness · Challenge', theorem: 'Prove that a subset $C\subseteq\mathbb{R}$ is connected if and only if it is an interval.' }
];
const levels = [
  { id: 'foundation', title: 'Foundation', note: 'Build the definitions and first proof moves.' },
  { id: 'standard', title: 'Standard', note: 'Work through the main ideas at a steady pace.' },
  { id: 'challenge', title: 'Challenge', note: 'Use fewer hints and connect more steps.' }
];

function MathText({ text = '' }: { text?: string }) {
  return <>{String(text).split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g).map((part, i) => {
    try {
      if (part.startsWith('$$') && part.endsWith('$$')) return <BlockMath key={i} math={part.slice(2, -2)} />;
      if (part.startsWith('$') && part.endsWith('$')) return <InlineMath key={i} math={part.slice(1, -1)} />;
    } catch { /* keep malformed math readable as text */ }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  })}</>;
}
function makeId() { return globalThis.crypto?.randomUUID?.() || `learner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function getProfileId() {
  try {
    const saved = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (saved) return saved;
    const id = makeId(); localStorage.setItem(ACTIVE_PROFILE_KEY, id); return id;
  } catch { return 'temporary'; }
}
function loadState(id: string): LearnerState {
  try { return JSON.parse(localStorage.getItem(profileKey(id)) || '{}'); } catch { return {}; }
}
function saveState(id: string, value: LearnerState) { try { localStorage.setItem(profileKey(id), JSON.stringify(value)); } catch { /* private browsing can disable storage */ } }
function cleanTutorText(value = '') { return String(value).replace(/\bProofwise\b/gi, 'Math Mastery').replace(/\bV2\b/gi, ''); }
function nextStarterId(current?: string) {
  try {
    const recent: string[] = JSON.parse(localStorage.getItem(RECENT_STARTS_KEY) || '[]');
    const available = starters.filter(s => s.id !== current && !recent.slice(-starters.length + 1).includes(s.id));
    const pool = available.length ? available : starters.filter(s => s.id !== current);
    const selected = pool[Math.floor(Math.random() * pool.length)] || starters[0];
    localStorage.setItem(RECENT_STARTS_KEY, JSON.stringify([...recent, selected.id].slice(-starters.length)));
    return selected.id;
  } catch { return starters[Math.floor(Math.random() * starters.length)].id; }
}
function stepFor(phase = '') { if (/Phase\s*[45]|solution|mastery assessment/i.test(phase)) return 3; if (/Phase\s*[34]|reconstruct|training/i.test(phase)) return 2; return 1; }

function SequenceDiagram() {
  return <div className="sequenceDiagram" role="img" aria-label="A visual cue showing later sequence terms to the right of N, with one selected term near the limit x">
    <div className="diagramHeading">A visual cue · choosing a sufficiently late term</div>
    <svg viewBox="0 0 760 205" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <rect x="305" y="48" width="420" height="94" rx="20" fill="#eeeafa" />
      <line x1="45" y1="139" x2="725" y2="139" stroke="#a2a7ae" strokeWidth="2" />
      <line x1="285" y1="28" x2="285" y2="163" stroke="#8373d7" strokeWidth="2" strokeDasharray="7 6" />
      <text x="275" y="22" fill="#7463cd" fontSize="18" fontWeight="700">N</text>
      <text x="500" y="78" fill="#208f78" fontSize="16" fontWeight="700">k ≥ N</text>
      {[75,150,225,340,430,520,610,700].map((x, i) => <g key={x}><circle cx={x} cy="139" r="10" fill={x < 285 ? '#9ba4ae' : '#8173d8'} /><text x={x - 4} y="172" fill="#727984" fontSize="13">{i + 1}</text></g>)}
      <circle cx="520" cy="139" r="21" fill="none" stroke="#208f78" strokeWidth="4" /><line x1="520" y1="118" x2="520" y2="87" stroke="#208f78" strokeWidth="3" /><text x="511" y="83" fill="#208f78" fontSize="15" fontWeight="700">x</text>
    </svg>
    <div className="diagramCaption">Later indices let us use the Cauchy condition; convergence of the subsequence brings one such term close to $x$.</div>
  </div>;
}

function App() {
  const [profileId, setProfileId] = useState(getProfileId);
  const [state, setState] = useState<LearnerState>(() => loadState(getProfileId()));
  const [selectedProblem, setSelectedProblem] = useState(() => loadState(getProfileId()).problemId || nextStarterId());
  const [customProblem, setCustomProblem] = useState('');
  const [difficulty, setDifficulty] = useState(() => loadState(getProfileId()).orientation?.comfort || 'standard');
  const [graphPreference, setGraphPreference] = useState(() => loadState(getProfileId()).orientation?.graphs || 'yes');
  const [choice, setChoice] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [diagramYes, setDiagramYes] = useState(true);

  useEffect(() => { saveState(profileId, state); }, [profileId, state]);
  const history = state.history || [];
  const attempts = history.length;
  const correct = history.filter(item => item.isCorrect).length;
  const currentStep = state.mode === 'repetition' ? 0 : stepFor(state.phase);
  const active = state.currentQuestion;
  const theorem = state.theorem || customProblem || starters.find(item => item.id === selectedProblem)?.theorem || starters[0].theorem;
  const isSequence = /cauchy/i.test(`${theorem} ${active?.prompt || ''}`) && /subsequence|sequence/i.test(`${theorem} ${active?.prompt || ''}`);
  const repeatedQuestion = useMemo(() => {
    const weak = [...history].reverse().find(item => item.isCorrect === false) || history[history.length - 1];
    return weak?.question || state.lastQuestion || active;
  }, [history, state.lastQuestion, active]);

  function createNewLearner() {
    const id = makeId();
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, id); } catch { /* continue in memory */ }
    setProfileId(id); setState({}); setSelectedProblem(nextStarterId(state.problemId)); setCustomProblem(''); setDifficulty('standard'); setGraphPreference('yes'); setChoice(''); setReasoning(''); setReasoningOpen(false); setError(''); setShowHistory(false); setDiagramYes(true);
  }
  function chooseNewProblem() {
    setState({}); setSelectedProblem(nextStarterId(state.problemId)); setCustomProblem(''); setChoice(''); setReasoning(''); setReasoningOpen(false); setError(''); setDiagramYes(true);
  }
  async function callTutor({ start = false, repetition = false, sillyMistake = null as boolean | null } = {}) {
    setBusy(true); setError('');
    const question = start ? null : state.currentQuestion || null;
    const answer = start ? null : choice || null;
    const problem = start ? theorem : state.theorem || theorem;
    const learnerNote = start ? '' : (state.mode === 'repetition' || repetition ? 'Continue in repetition mode: revisit weak ideas, repeat questions when useful, and offer a new attempt only after feedback.' : '');
    const data = {
      theorem: problem,
      phase: start ? 'Step 1' : state.phase || 'Step 1',
      mode: repetition ? 'repetition' : state.mode || 'guided',
      difficulty,
      currentQuestion: question,
      answer,
      reasoning: answer && reasoningOpen ? reasoning : '',
      note: learnerNote,
      history: start ? [] : history.slice(-8).map(item => ({ question: item.prompt, choice: item.choice, isCorrect: item.isCorrect, skill: item.skill, reasoning: item.reasoning, feedback: item.feedback })),
      diagnosticsCount: start ? 0 : state.diagnosticsCount || 0,
      orientation: { comfort: difficulty, graphs: graphPreference },
      sillyMistake
    };
    try {
      const response = await fetch(`${API_URL}/tutor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      let output: any;
      try { output = await response.json(); } catch { throw new Error(`The tutor returned an unreadable response (${response.status}).`); }
      if (!response.ok) throw new Error(output.error || `Tutor request failed (${response.status}).`);
      if (!output.nextQuestion || !Array.isArray(output.nextQuestion.options) || output.nextQuestion.options.length !== 5) throw new Error('The tutor returned an incomplete question. Please try again.');
      const updatedHistory = start ? [] : answer && question ? [...history, { prompt: question.prompt, question, choice: answer, reasoning: reasoningOpen ? reasoning : '', feedback: output.feedback || '', isCorrect: output.answerCorrect, skill: question.skill, time: Date.now() }] : history;
      const nextQuestion: Question = { ...output.nextQuestion, prompt: cleanTutorText(output.nextQuestion.prompt), options: output.nextQuestion.options.map((item: string) => cleanTutorText(item)), skill: cleanTutorText(output.nextQuestion.skill || '') };
      setState({
        theorem: problem,
        problemId: selectedProblem,
        phase: output.phase || state.phase || 'Step 1',
        currentQuestion: output.awaitingSillyMistake ? question || undefined : nextQuestion,
        lastQuestion: answer && question ? question : state.lastQuestion,
        history: updatedHistory,
        mode: repetition || state.mode === 'repetition' ? 'repetition' : 'guided',
        diagnosticsCount: output.diagnosticsCount ?? state.diagnosticsCount ?? 0,
        awaitingSillyMistake: Boolean(output.awaitingSillyMistake),
        feedback: cleanTutorText(output.feedback || ''),
        explanation: cleanTutorText(output.explanation || ''),
        verdict: answer ? output.answerCorrect : null,
        diagnosedSkill: output.diagnosedSkill || '',
        orientation: { comfort: difficulty, graphs: graphPreference }
      });
      setChoice(''); setReasoning(''); setReasoningOpen(false);
    } catch (e: any) { setError(e?.message || 'Could not reach the tutor. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  function beginLesson() {
    const trimmed = (customProblem || theorem).trim();
    if (!trimmed) { setError('Choose a problem or paste a theorem to begin.'); return; }
    setState({}); setChoice(''); setReasoning(''); setReasoningOpen(false); setDiagramYes(true);
    void callTutor({ start: true });
  }
  function enterRepetition(question?: Question) {
    const target = question || repeatedQuestion;
    if (!target) { setError('Answer a question first; then you can repeat it here.'); return; }
    setState(prev => ({ ...prev, currentQuestion: target, lastQuestion: target, mode: 'repetition', awaitingSillyMistake: false, feedback: '', explanation: '', verdict: null, phase: 'Repetition' }));
    setChoice(''); setReasoning(''); setReasoningOpen(false); setError('');
  }
  function pickDifferentProblem() { setSelectedProblem(nextStarterId(selectedProblem)); setCustomProblem(''); }
  async function importProblem(file?: File) {
    if (!file) return;
    if (file.size > 24000) { setError('Please choose a text file under 24 KB.'); return; }
    const text = await file.text();
    if (text.length > 12000) { setError('The problem must be 12,000 characters or fewer.'); return; }
    setCustomProblem(text); setError('');
  }

  return <div className="app">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><div className="brandmark"><BookOpen size={20} /></div><div><div className="brandtitle">MATH <span>MASTERY</span></div><div className="brandsub">PERSONAL STUDY SPACE</div></div><button className="mobileClose" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="sidegroup"><div className="sidetitle">PROGRESS</div>
        {[1, 2, 3].map(step => <div className={`phase ${currentStep === step ? 'selected' : ''} ${currentStep > step ? 'completed' : ''}`} key={step}><div className="phase-index">{currentStep > step ? <Check size={13} /> : step}</div><span>Step {step}</span></div>)}
        <button className={`repetitionLink ${state.mode === 'repetition' ? 'selected' : ''}`} disabled={!active && !history.length} onClick={() => state.mode === 'repetition' ? setState(prev => ({ ...prev, mode: 'guided', phase: prev.phase?.startsWith('Repetition') ? 'Step 2' : prev.phase })) : enterRepetition()}><RotateCcw size={15} /> REPITITION MODE</button>
      </div>
      <div className="sidebarFoot"><ShieldCheck size={16} /><span>Your progress stays on this device.</span></div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="menuButton" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open menu"><Menu size={20} /></button><div className="crumb">Study space <ChevronRight size={14} /> <span>{state.theorem ? 'Current problem' : 'Choose a starting point'}</span></div><div className="topright"><span className="localBadge"><span className="liveDot" /> Anonymous session</span><button className="newLearner" onClick={createNewLearner}>New learner</button></div></header>
      <div className="content">
        {!active && !state.theorem && <>
          <div className="eyebrow"><span className="eyedot" /> MATHEMATICS STUDY SPACE</div>
          <h1>Make the next idea<br /><span>click into place.</span></h1>
          <p className="intro">Choose a problem that interests you. Pick a pace, then work through one clear question at a time. No account or long written responses required.</p>
          <section className="startPanel">
            <div className="panelHead"><div><div className="sectionlabel"><span className="sectionnum">01</span> STARTING POINT</div><h2>What would you like to work on?</h2></div><button className="textButton" onClick={pickDifferentProblem}><Sparkles size={15} /> Surprise me</button></div>
            <div className="starterGrid">{starters.map(item => <button key={item.id} className={`starterCard ${selectedProblem === item.id && !customProblem ? 'chosen' : ''}`} onClick={() => { setSelectedProblem(item.id); setCustomProblem(''); setError(''); }}><span className="starterTopic">{item.topic}</span><strong>{item.title}</strong><span className="starterMath"><MathText text={item.theorem} /></span><span className="chooseMark">{selectedProblem === item.id && !customProblem ? 'Selected' : 'Choose problem'}</span></button>)}</div>
            <div className="customRow"><label htmlFor="customProblem">Or bring your own</label><textarea id="customProblem" rows={2} placeholder="Paste a theorem, exercise, or proof prompt (optional)." value={customProblem} onChange={e => { setCustomProblem(e.target.value); if (e.target.value) setSelectedProblem('custom'); }} /><label className="importButton"><FileUp size={15} /> Upload text<input type="file" accept=".txt,.md,.tex,text/plain,text/markdown" onChange={e => void importProblem(e.target.files?.[0])} /></label></div>
            <div className="preferencePanel">
              <div><div className="sectionlabel"><span className="sectionnum">02</span> YOUR PACE</div><div className="levelChoices" role="radiogroup" aria-label="Choose difficulty">{levels.map(level => <button key={level.id} role="radio" aria-checked={difficulty === level.id} className={`levelChoice ${difficulty === level.id ? 'chosen' : ''}`} onClick={() => setDifficulty(level.id)}><strong>{level.title}</strong><span>{level.note}</span></button>)}</div></div>
              <div className="formatChoice"><div className="sectionlabel"><span className="sectionnum">03</span> ANSWER STYLE</div><div className="selectedFormat"><span className="formatIcon">A–E</span><div><strong>Multiple choice</strong><small>Tap an option. Add reasoning only if you want.</small></div><Check size={17} /></div><label className="diagramToggle"><input type="checkbox" checked={graphPreference === 'yes'} onChange={e => setGraphPreference(e.target.checked ? 'yes' : 'no')} /> Show a diagram when it helps</label></div>
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            <div className="startFooter"><span>New learner sessions are kept separately in this browser. No sign-up needed.</span><button className="button primary startButton" disabled={busy || (!customProblem.trim() && !selectedProblem)} onClick={beginLesson}>{busy ? 'Preparing your first question…' : 'Begin with this problem'} <ArrowRight size={16} /></button></div>
          </section>
          <footer>Mathematics practice · Your progress is private to this browser.</footer>
        </>}

        {active && <>
          <div className="activeTop"><div><div className="eyebrow"><span className="eyedot" /> {state.mode === 'repetition' ? 'REPITITION MODE' : `STEP ${currentStep}`}</div><h1 className="activeTitle">One question.<br /><span>Take your time.</span></h1></div><button className="button secondary changeProblem" onClick={chooseNewProblem}>Choose another problem</button></div>
          <div className="lessonLayout"><section className="lessonMain">
            <div className="theoremCard"><div className="cardTop"><div className="miniTag"><BookOpen size={14} /> CURRENT PROBLEM</div><span className="chapter">{levels.find(level => level.id === difficulty)?.title || 'Standard'} pace</span></div><div className="theoremText"><MathText text={state.theorem || theorem} /></div></div>
            {!state.awaitingSillyMistake && <div className="questionCard">
              <div className="questionHead"><div><div className="questionCounter">QUESTION {attempts + 1}{state.mode === 'repetition' ? ' · REPETITION' : ''}</div><div className="questionSkill">{active.skill || 'Problem reasoning'} <span>·</span> {active.difficulty || difficulty}</div></div><button className="iconButton" title="Repeat this question" aria-label="Repeat this question" onClick={() => enterRepetition(active)}><RotateCcw size={16} /></button></div>
              <div className="questionPrompt"><MathText text={active.prompt} /></div>
              {graphPreference === 'yes' && diagramYes && isSequence && <SequenceDiagram />}
              {graphPreference === 'yes' && isSequence && <button className="diagramDismiss" onClick={() => setDiagramYes(false)}>Hide this visual</button>}
              <div className="options" role="radiogroup" aria-label="Choose one answer">{(active.options || []).map((option, index) => <button key={`${index}-${option}`} className={`option ${choice === 'ABCDE'[index] ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'ABCDE'[index]} onClick={() => setChoice('ABCDE'[index])} disabled={busy}><span className="optionLetter">{'ABCDE'[index]}</span><span className="optionText"><MathText text={option.replace(/^[A-E][.)]\s*/, '')} /></span><span className="optionRadio" /></button>)}<button className={`option unknown ${choice === 'F' ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'F'} onClick={() => setChoice('F')} disabled={busy}><span className="optionLetter">F</span><span className="optionText">I don't know yet</span><span className="optionRadio" /></button></div>
              {reasoningOpen ? <div className="reasoningWrap"><label htmlFor="reason">Reasoning <span>optional</span></label><textarea id="reason" className="reasonField" rows={2} value={reasoning} onChange={e => setReasoning(e.target.value)} placeholder="A phrase is enough. You can also leave this blank." disabled={busy} /><button className="textButton" onClick={() => { setReasoningOpen(false); setReasoning(''); }}>Close</button></div> : <button className="addReasoning" onClick={() => setReasoningOpen(true)}><CircleHelp size={15} /> Add optional reasoning</button>}
              <div className="submitBar"><span>Choose one option, then continue.</span><button className="button primary" disabled={busy || !choice} onClick={() => void callTutor()}>{busy ? 'Checking…' : 'Submit answer'} <Send size={15} /></button></div>
            </div>}
            {state.feedback && <div className={`feedbackCard ${state.verdict === true ? 'positive' : state.verdict === false ? 'negative' : 'neutral'}`}><div className="feedbackHeading">{state.verdict === true ? <><Check size={18} /> Correct</> : state.verdict === false ? <><X size={18} /> Let's repair this step</> : 'A note for this step'}</div><p><MathText text={state.feedback} /></p>{state.explanation && <div className="explanation"><MathText text={state.explanation} /></div>}{state.lastQuestion && <button className="repeatQuestionButton" onClick={() => enterRepetition(state.lastQuestion)}><RotateCcw size={14} /> Repeat this question</button>}</div>}
            {state.awaitingSillyMistake && <div className="sillyCheck"><strong>Would you like another try?</strong><div className="sillyActions"><button className="button secondary" disabled={busy} onClick={() => void callTutor({ sillyMistake: true })}>Yes, try again</button><button className="button primary" disabled={busy} onClick={() => void callTutor({ sillyMistake: false })}>Show me what I missed</button></div></div>}
            {error && <div className="error" role="alert">{error}</div>}
          </section>
          <aside className="lessonAside"><div className="statsCard"><div className="statHeading">YOUR PROGRESS</div><div className="statsgrid"><div><span className="bigStat">{attempts}</span><small>Questions answered</small></div><div><span className="bigStat">{correct}</span><small>Correct</small></div></div><div className="statsLine"><span>Accuracy</span><strong>{attempts ? `${Math.round(correct / attempts * 100)}%` : '—'}</strong></div><div className="meter"><span style={{ width: `${attempts ? correct / attempts * 100 : 0}%` }} /></div><button className="historyToggle" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide question history' : 'Review answered questions'}</button></div>
            {showHistory && <div className="historyCard"><strong>Answered questions</strong>{history.length ? [...history].reverse().map((item, index) => <div className="historyItem" key={`${item.time}-${index}`}><span className={item.isCorrect ? 'historyGood' : 'historyRetry'}>{item.isCorrect ? 'Correct' : 'Review'}</span><p>{item.prompt}</p><button onClick={() => enterRepetition(item.question)}><RotateCcw size={13} /> Repeat</button></div>) : <p>Your answered questions will appear here.</p>}</div>}
            <div className="insightCard"><div className="insightIcon"><Sparkles size={17} /></div><strong>{state.mode === 'repetition' ? 'Come back to it' : 'Build a clear line of thought'}</strong><p>{state.mode === 'repetition' ? 'Repeat this question or return to the guided sequence whenever you are ready.' : 'Missed questions stay available for review. You can revisit any of them as often as you need.'}</p>{state.diagnosedSkill && <div className="focus"><span>WORKING ON</span><strong>{state.diagnosedSkill}</strong></div>}</div>
          </aside></div>
          <footer>Practice stays in this browser. No account is required.</footer>
        </>}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
