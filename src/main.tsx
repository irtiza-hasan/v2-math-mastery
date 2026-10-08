import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockMath, InlineMath } from 'react-katex';
import { ArrowUp, BookOpen, Check, ChevronRight, Image as ImageIcon, LoaderCircle, Menu, Paperclip, RotateCcw, ShieldCheck, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import './styles.css';

type Diagram = { type: 'sequence' | 'numberLine' | 'mapping' | 'none'; caption: string; labels?: string[] };
type Question = { prompt: string; options: string[]; correctAnswer: string; skill?: string; difficulty?: string; diagram?: Diagram };
type Attempt = { question: Question; choice: string; reasoning: string; feedback: string; explanation: string; isCorrect: boolean | null; time: number };
type LearnerState = { theorem?: string; phase?: string; currentQuestion?: Question; history?: Attempt[]; mode?: 'guided' | 'repetition'; diagnosticsCount?: number; awaitingSillyMistake?: boolean; feedback?: string; explanation?: string; verdict?: boolean | null; diagnosedSkill?: string; difficulty?: string; lastQuestion?: Question };
type ImageInput = { mimeType: string; data: string; name: string; preview: string };

const API_URL = (import.meta.env.VITE_API_URL || 'https://proofwise-api.irtiza-proofwise.workers.dev').replace(/\/$/, '');
const ACTIVE_PROFILE_KEY = 'math-mastery-anonymous-profile';
const RECENT_STARTS_KEY = 'math-mastery-recent-starts';
const profileKey = (id: string) => `math-mastery-progress-${id}`;

function MathText({ text = '' }: { text?: string }) {
  return <>{String(text).split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g).map((part, i) => {
    try {
      if (part.startsWith('$$') && part.endsWith('$$')) return <BlockMath key={i} math={part.slice(2, -2)} />;
      if (part.startsWith('$') && part.endsWith('$')) return <InlineMath key={i} math={part.slice(1, -1)} />;
    } catch { /* leave malformed notation readable */ }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  })}</>;
}
function makeId() { return globalThis.crypto?.randomUUID?.() || `learner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
function getProfileId() {
  try { const saved = localStorage.getItem(ACTIVE_PROFILE_KEY); if (saved) return saved; const id = makeId(); localStorage.setItem(ACTIVE_PROFILE_KEY, id); return id; }
  catch { return 'temporary'; }
}
function loadState(id: string): LearnerState { try { return JSON.parse(localStorage.getItem(profileKey(id)) || '{}'); } catch { return {}; } }
function saveState(id: string, value: LearnerState) { try { localStorage.setItem(profileKey(id), JSON.stringify(value)); } catch { /* storage may be unavailable in private browsing */ } }
function cleanTutorText(value = '') { return String(value).replace(/\bProofwise\b/gi, 'Math Mastery').replace(/\bV2\b/gi, ''); }
function recentProblem(): string {
  try { const items = JSON.parse(localStorage.getItem(RECENT_STARTS_KEY) || '[]'); return String(items.at(-1) || ''); } catch { return ''; }
}
function rememberProblem(text: string) {
  try { const items = JSON.parse(localStorage.getItem(RECENT_STARTS_KEY) || '[]'); localStorage.setItem(RECENT_STARTS_KEY, JSON.stringify([...items, text.slice(0, 120)].slice(-10))); } catch { /* optional */ }
}
function stepFor(phase = '') { const n = Number(phase.match(/step\s*(\d)/i)?.[1]); return n >= 1 && n <= 3 ? n : /repetition/i.test(phase) ? 0 : 1; }
function imageData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be opened.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

function SequenceDiagram({ diagram }: { diagram: Diagram }) {
  if (diagram.type === 'none') return null;
  if (diagram.type === 'numberLine') return <div className="visualCard"><div className="visualLine"><span className="visualInterval" /><span className="visualPoint left" /><span className="visualPoint center" /><span className="visualPoint right" /></div><div className="visualLabels"><span>{diagram.labels?.[0] || 'start'}</span><span>{diagram.labels?.[1] || 'middle'}</span><span>{diagram.labels?.[2] || 'target'}</span></div><p>{diagram.caption}</p></div>;
  if (diagram.type === 'mapping') return <div className="visualCard mappingVisual"><div><span>{diagram.labels?.[0] || 'Input'}</span><b>x</b><b>y</b><b>z</b></div><svg viewBox="0 0 180 120" aria-hidden="true"><path d="M20 28 C90 25 88 31 150 31 M20 60 C90 58 89 62 150 60 M20 92 C92 88 90 48 150 60" fill="none" stroke="#438b77" strokeWidth="2" markerEnd="url(#arrow)"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#438b77" /></marker></defs></svg><div><span>{diagram.labels?.[1] || 'Output'}</span><b>f(x)</b><b>f(y)</b><b>f(z)</b></div><p>{diagram.caption}</p></div>;
  return <div className="visualCard sequenceVisual"><div className="visualCaption">A useful picture for this step</div><svg viewBox="0 0 760 170" role="img" aria-label="Later sequence terms and the convergent subsequence approach the same limit"><rect x="315" y="28" width="415" height="87" rx="18" fill="#e9f2ed"/><line x1="35" y1="107" x2="728" y2="107" stroke="#a2aaa5" strokeWidth="2"/><line x1="286" y1="15" x2="286" y2="131" stroke="#438b77" strokeWidth="2" strokeDasharray="6 6"/><text x="277" y="14" fill="#438b77" fontSize="16">N</text>{[68,145,222,343,422,503,584,670].map((x,i)=><g key={x}><circle cx={x} cy="107" r="9" fill={x<286?'#a0aaa4':'#438b77'}/><text x={x-4} y="139" fill="#748079" fontSize="12">{i+1}</text></g>)}<circle cx="503" cy="107" r="20" fill="none" stroke="#29866f" strokeWidth="4"/><text x="497" y="65" fill="#29866f" fontSize="15">x</text></svg><p>{diagram.caption || 'A late term can be chosen close to the limit.'}</p></div>;
}

function App() {
  const [profileId, setProfileId] = useState(getProfileId);
  const [state, setState] = useState<LearnerState>(() => loadState(getProfileId()));
  const [problemText, setProblemText] = useState('');
  const [image, setImage] = useState<ImageInput | null>(null);
  const [choice, setChoice] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  useEffect(() => { saveState(profileId, state); }, [profileId, state]);
  const history = state.history || [];
  const attempts = history.length;
  const correct = history.filter(item => item.isCorrect).length;
  const active = state.currentQuestion;
  const isSequence = /cauchy|sequence/i.test(`${state.theorem || ''} ${active?.prompt || ''}`);
  const currentStep = state.mode === 'repetition' ? 0 : stepFor(state.phase);
  const progressValue = Math.min(100, Math.round((correct / Math.max(attempts, 1)) * 76 + Math.min(attempts, 5) * 4));
  const repeatedQuestion = useMemo(() => [...history].reverse().find(item => item.isCorrect === false)?.question || history.at(-1)?.question || state.lastQuestion || active, [history, state.lastQuestion, active]);

  function createNewLearner() {
    const id = makeId();
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, id); } catch { /* continue in memory */ }
    setProfileId(id); setState({}); setProblemText(''); setImage(null); setChoice(''); setReasoning(''); setError(''); setShowHistory(false); setShowDiagram(false); setShowSolution(false);
  }
  function chooseNewProblem() { setState({}); setProblemText(''); setImage(null); setChoice(''); setReasoning(''); setError(''); setShowDiagram(false); setShowSolution(false); }
  async function callTutor({ start = false, repetition = false, sillyMistake = null as boolean | null } = {}) {
    setBusy(true); setError('');
    const question = start ? null : state.currentQuestion || null;
    const answer = start ? null : choice || null;
    const theorem = start ? problemText.trim() : state.theorem || '';
    const updatedHistory = start ? [] : answer && question ? [...history, { question, choice: answer, reasoning, feedback: state.feedback || '', explanation: state.explanation || '', isCorrect: state.verdict ?? null, time: Date.now() }] : history;
    const body = {
      theorem,
      image: start && image ? { mimeType: image.mimeType, data: image.data } : undefined,
      phase: start ? 'Step 1' : state.phase || 'Step 1',
      mode: repetition ? 'repetition' : state.mode || 'guided',
      difficulty: state.difficulty || 'adaptive',
      currentQuestion: question,
      answer,
      reasoning: answer ? reasoning : '',
      history: start ? [] : history.slice(-8).map(item => ({ question: item.question.prompt, choice: item.choice, isCorrect: item.isCorrect, skill: item.question.skill, reasoning: item.reasoning, feedback: item.feedback })),
      diagnosticsCount: start ? 0 : state.diagnosticsCount || 0,
      diagramRequested: Boolean(showDiagram),
      sillyMistake
    };
    try {
      const response = await fetch(`${API_URL}/tutor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let output: any;
      try { output = await response.json(); } catch { throw new Error(`The tutor returned an unreadable response (${response.status}).`); }
      if (!response.ok) throw new Error(output.error || `Tutor request failed (${response.status}).`);
      if (!output.nextQuestion || !Array.isArray(output.nextQuestion.options) || output.nextQuestion.options.length !== 5) throw new Error('The tutor returned an incomplete question. Please try again.');
      const recognizedProblem = cleanTutorText(output.problem || theorem);
      if (!recognizedProblem.trim()) throw new Error('I could not read a clear problem from that image. Try a sharper photo or paste the problem text.');
      const nextQuestion: Question = {
        ...output.nextQuestion,
        prompt: cleanTutorText(output.nextQuestion.prompt),
        options: output.nextQuestion.options.map((item: string) => cleanTutorText(item)),
        skill: cleanTutorText(output.nextQuestion.skill || ''),
        diagram: output.nextQuestion.diagram && typeof output.nextQuestion.diagram === 'object' ? output.nextQuestion.diagram : { type: 'none', caption: '' }
      };
      setState({
        theorem: recognizedProblem,
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
        diagnosedSkill: cleanTutorText(output.diagnosedSkill || ''),
        difficulty: nextQuestion.difficulty || output.difficulty || state.difficulty || 'standard'
      });
      if (start) { rememberProblem(recognizedProblem); setProblemText(''); setImage(null); }
      setChoice(''); setReasoning(''); setShowDiagram(false); setShowSolution(false);
    } catch (e: any) { setError(e?.message || 'Could not reach the tutor. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  function beginLesson() {
    if (!problemText.trim() && !image) { setError('Paste your problem here or attach a clear image of it.'); return; }
    setState({}); setChoice(''); setReasoning(''); setShowDiagram(false); setShowSolution(false);
    void callTutor({ start: true });
  }
  function enterRepetition(target?: Question) {
    const question = target || repeatedQuestion;
    if (!question) { setError('Answer a question first; then you can repeat it here.'); return; }
    setState(prev => ({ ...prev, currentQuestion: question, lastQuestion: question, mode: 'repetition', awaitingSillyMistake: false, feedback: '', explanation: '', verdict: null, phase: 'Repetition' }));
    setChoice(''); setReasoning(''); setShowDiagram(false); setShowSolution(false); setError('');
  }
  async function attachImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Use a JPG, PNG, or WebP image.'); return; }
    if (file.size > 4 * 1024 * 1024) { setError('Choose an image smaller than 4 MB.'); return; }
    try { const data = await imageData(file); setImage({ mimeType: file.type, data, name: file.name, preview: URL.createObjectURL(file) }); setError(''); }
    catch (e: any) { setError(e.message || 'Could not open that image.'); }
  }
  const answerLabel = (item: Attempt) => item.choice === 'F' ? "I don't know yet" : item.question.options['ABCDE'.indexOf(item.choice)] || item.choice;

  return <div className="app">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><div className="brandmark"><BookOpen size={21} /></div><div><div className="brandtitle">MATH <span>MASTERY</span></div><div className="brandsub">PERSONAL STUDY SPACE</div></div><button className="mobileClose" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="sidegroup"><div className="sidetitle">YOUR LEARNING PATH</div>
        <div className="pathMeter"><div className="pathMeterTop"><span>Progress</span><strong>{attempts ? `${progressValue}%` : 'Ready'}</strong></div><div className="pathMeterTrack"><span style={{ width: `${attempts ? progressValue : 4}%` }} /></div></div>
        {[1, 2, 3].map(step => <div className={`phase ${currentStep === step ? 'selected' : ''} ${currentStep > step ? 'completed' : ''}`} key={step}><div className="phase-index">{currentStep > step ? <Check size={14} /> : step}</div><span>Step {step}</span><i /></div>)}
        <button className={`repetitionLink ${state.mode === 'repetition' ? 'selected' : ''}`} disabled={!active && !history.length} onClick={() => state.mode === 'repetition' ? setState(prev => ({ ...prev, mode: 'guided', phase: prev.phase?.startsWith('Repetition') ? 'Step 2' : prev.phase })) : enterRepetition()}><RotateCcw size={16} /> REPITITION MODE</button>
      </div>
      <div className="sidebarFoot"><ShieldCheck size={17} /><span>Your learning history stays in this browser.</span></div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="menuButton" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open menu"><Menu size={21} /></button><div className="crumb">Study space <ChevronRight size={15} /> <span>{state.theorem ? 'Current problem' : 'Start with your problem'}</span></div><div className="topright"><span className="localBadge"><span className="liveDot" /> Anonymous session</span><button className="newLearner" onClick={createNewLearner}>New learner</button></div></header>
      <div className={`content ${active ? 'chatContent' : 'startContent'}`}>
        {!active && !state.theorem && <section className="welcomeChat">
          <div className="welcomeMark"><BookOpen size={24} /></div><div className="eyebrow"><span className="eyedot" /> MATHEMATICS STUDY SPACE</div>
          <h1>What problem are<br className="desktopBreak" /> you working on?</h1>
          <p className="intro">Paste it here or upload a photo. We’ll begin with one question and adjust the pace to your answers.</p>
          <div className="composer startComposer">
            <textarea aria-label="Math problem" rows={4} placeholder="Paste a theorem, exercise, or proof question…" value={problemText} onChange={e => { setProblemText(e.target.value); setError(''); }} disabled={busy} />
            {image && <div className="imageAttachment"><img src={image.preview} alt="Selected problem" /><span>{image.name}</span><button aria-label="Remove image" onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); }}><X size={16} /></button></div>}
            <div className="composerActions"><label className="attachButton"><Paperclip size={19} /><span>Upload image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void attachImage(e.target.files?.[0])} /></label><span className="inputHint">No account needed</span><button className="sendButton" onClick={beginLesson} disabled={busy || (!problemText.trim() && !image)} aria-label="Begin with this problem">{busy ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={21} />}</button></div>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <p className="privacyHint"><ShieldCheck size={15} /> Your progress is saved only in this browser.</p>
        </section>}

        {active && <>
          <div className="activeTop"><div><div className="eyebrow"><span className="eyedot" /> {state.mode === 'repetition' ? 'REPITITION MODE' : `STEP ${currentStep}`}</div><h1 className="activeTitle">Let’s work through it.</h1></div><button className="button secondary changeProblem" onClick={chooseNewProblem}>New problem</button></div>
          <section className="chatThread" aria-label="Tutoring conversation">
            <div className="userBubble problemBubble"><span className="bubbleLabel">YOUR PROBLEM</span><div><MathText text={state.theorem || ''} /></div></div>
            {state.feedback && attempts === 0 && <div className="assistantMessage"><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble"><div className="messageLabel">LET’S BEGIN</div><p><MathText text={state.feedback} /></p>{state.explanation && <p className="explanationText"><MathText text={state.explanation} /></p>}</div></div>}
            {history.map((item, index) => <React.Fragment key={`${item.time}-${index}`}>
              <div className="userBubble answerBubble"><span className="bubbleLabel">YOUR ANSWER</span><p><MathText text={answerLabel(item)} /></p>{item.reasoning && <p className="answerReasoning">{item.reasoning}</p>}</div>
              <div className="assistantMessage"><div className={`assistantMark ${item.isCorrect ? 'markCorrect' : item.isCorrect === false ? 'markReview' : ''}`}>{item.isCorrect ? <Check size={17} /> : <BookOpen size={17} />}</div><div className={`assistantBubble ${item.isCorrect === false ? 'reviewBubble' : item.isCorrect ? 'correctBubble' : ''}`}><div className="messageLabel">{item.isCorrect ? 'CORRECT' : item.isCorrect === false ? 'LET’S REVIEW THIS' : 'TUTOR'}</div><p><MathText text={item.feedback} /></p>{item.explanation && <p className="explanationText"><MathText text={item.explanation} /></p>}<button className="inlineRepeat" onClick={() => enterRepetition(item.question)}><RotateCcw size={14} /> Repeat this question</button></div></div>
            </React.Fragment>)}

            {!state.awaitingSillyMistake && <div className="assistantMessage currentTurn"><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble questionBubble">
              <div className="questionMeta"><span>{active.skill || 'Problem reasoning'}</span><span className="metaDot" /> <span>Adaptive · {active.difficulty || state.difficulty || 'finding your pace'}</span><button className="iconButton" title="Repeat this question" aria-label="Repeat this question" onClick={() => enterRepetition(active)}><RotateCcw size={16} /></button></div>
              <div className="questionPrompt"><MathText text={active.prompt} /></div>
              {active.diagram?.type && active.diagram.type !== 'none' && <><button className="visualToggle" onClick={() => setShowDiagram(!showDiagram)}>{showDiagram ? 'Hide visual' : 'Show a visual'} <ChevronRight size={15} className={showDiagram ? 'chevronOpen' : ''} /></button>{showDiagram && <SequenceDiagram diagram={active.diagram} />}</>}
              <div className="options" role="radiogroup" aria-label="Choose one answer">{(active.options || []).map((option, index) => <button key={`${index}-${option}`} className={`option ${choice === 'ABCDE'[index] ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'ABCDE'[index]} onClick={() => setChoice('ABCDE'[index])} disabled={busy}><span className="optionLetter">{'ABCDE'[index]}</span><span className="optionText"><MathText text={option.replace(/^[A-E][.)]\s*/, '')} /></span><span className="optionRadio" /></button>)}<button className={`option unknown ${choice === 'F' ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'F'} onClick={() => setChoice('F')} disabled={busy}><span className="optionLetter">F</span><span className="optionText">I don't know yet</span><span className="optionRadio" /></button></div>
              <label className="reasoningLabel" htmlFor="reason">Optional reasoning</label><textarea id="reason" className="reasonField" rows={2} value={reasoning} onChange={e => setReasoning(e.target.value)} placeholder="Add a thought if you’d like, or leave this blank." disabled={busy} />
              <div className="submitBar"><span>Choose an answer to continue.</span><button className="button primary" disabled={busy || !choice} onClick={() => void callTutor()}>{busy ? 'Checking…' : 'Send answer'} {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={17} />}</button></div>
            </div></div>}
            {state.awaitingSillyMistake && <div className="assistantMessage"><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble"><p>Would you like another try?</p><div className="sillyActions"><button className="button secondary" disabled={busy} onClick={() => void callTutor({ sillyMistake: true })}>Try once more</button><button className="button primary" disabled={busy} onClick={() => void callTutor({ sillyMistake: false })}>Show me what I missed</button></div></div></div>}
            {error && <div className="error" role="alert">{error}</div>}
          </section>
          <aside className="lessonAside"><div className="statsCard"><div className="statHeading">YOUR PROGRESS</div><div className="statsgrid"><div><span className="bigStat">{attempts}</span><small>Questions answered</small></div><div><span className="bigStat">{correct}</span><small>Correct</small></div></div><div className="statsLine"><span>Accuracy</span><strong>{attempts ? `${Math.round(correct / attempts * 100)}%` : '—'}</strong></div><div className="meter"><span style={{ width: `${attempts ? correct / attempts * 100 : 0}%` }} /></div><button className="historyToggle" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Hide question history' : 'Review answered questions'}</button></div>
            {showHistory && <div className="historyCard"><strong>Answered questions</strong>{history.length ? [...history].reverse().map((item, index) => <div className="historyItem" key={`${item.time}-${index}`}><span className={item.isCorrect ? 'historyGood' : 'historyRetry'}>{item.isCorrect ? 'Correct' : 'Review'}</span><p>{item.question.prompt}</p><button onClick={() => enterRepetition(item.question)}><RotateCcw size={13} /> Repeat</button></div>) : <p>Your answered questions will appear here.</p>}</div>}
            <div className="insightCard"><div className="insightIcon"><BookOpen size={17} /></div><strong>{state.mode === 'repetition' ? 'Return to it when ready' : 'Build understanding one step at a time'}</strong><p>{state.mode === 'repetition' ? 'You can repeat this question or continue the guided sequence.' : 'Questions adapt to your answers. Missed ideas stay ready for another try.'}</p>{state.diagnosedSkill && <div className="focus"><span>WORKING ON</span><strong>{state.diagnosedSkill}</strong></div>}</div>
          </aside>
          <footer>Practice stays in this browser. No account is required.</footer>
        </>}
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
