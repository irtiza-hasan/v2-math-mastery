import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BlockMath, InlineMath } from 'react-katex';
import { ArrowUp, BookOpen, Check, ChevronRight, LoaderCircle, Menu, Paperclip, RotateCcw, ShieldCheck, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import './styles.css';

type Diagram = { type: 'sequence' | 'numberLine' | 'mapping' | 'none'; caption: string; labels?: string[] };
type Question = { prompt: string; options: string[]; correctAnswer: string; skill?: string; difficulty?: string; diagram?: Diagram };
type Attempt = { question: Question; choice: string; reasoning: string; feedback: string; explanation: string; isCorrect: boolean | null; time: number };
type LearnerState = { theorem?: string; phase?: string; currentQuestion?: Question; stage?: 'diagnostic' | 'learning' | 'proof' | 'repetition'; learningPlan?: { focus: string; nextMove: string }; history?: Attempt[]; mode?: 'guided' | 'repetition'; diagnosticsCount?: number;  feedback?: string; explanation?: string; verdict?: boolean | null; diagnosedSkill?: string; difficulty?: string; lastQuestion?: Question };
type ImageInput = { mimeType: string; data: string; name: string; preview: string };

const API_URL = (import.meta.env.VITE_API_URL || 'https://proofwise-api.irtiza-proofwise.workers.dev').replace(/\/$/, '');
const ACTIVE_PROFILE_KEY = 'math-mastery-anonymous-profile';
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
function cleanTutorText(value = '') { return String(value).replace(/\b(?:Proofwise|Math Mastery)\b/gi, 'Virtual Adaptive Teaching Assistant').replace(/\bV2\b/gi, ''); }
function stepFor(phase = '') { const n = Number(phase.match(/step\s*(\d)/i)?.[1]); return n >= 1 && n <= 3 ? n : /repetition/i.test(phase) ? 0 : 1; }
function correctStreak(history: Attempt[]) { let count = 0; for (let i = history.length - 1; i >= 0 && history[i].isCorrect === true; i--) count++; return count; }
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [showLearningPlan, setShowLearningPlan] = useState(false);

  useEffect(() => { saveState(profileId, state); }, [profileId, state]);
  useEffect(() => () => { if (image?.preview) URL.revokeObjectURL(image.preview); }, [image]);
  const history = state.history || [];
  const attempts = history.length;
  const correct = history.filter(item => item.isCorrect).length;
  const currentStreak = correctStreak(history);
  const active = state.currentQuestion;
  const stage = state.mode === 'repetition' ? 'repetition' : state.stage || (Math.min(10, state.diagnosticsCount || 0) >= 10 || stepFor(state.phase) > 1 ? 'learning' : 'diagnostic');
  const currentStep = stage === 'repetition' ? 0 : stage === 'diagnostic' ? 1 : stage === 'proof' ? 3 : 2;
  const progressValue = attempts ? Math.round((correct / attempts) * 100) : 0;
  const repeatedQuestion = useMemo(() => [...history].reverse().find(item => item.isCorrect === false)?.question || history.at(-1)?.question || state.lastQuestion || active, [history, state.lastQuestion, active]);

  function createNewLearner() {
    const id = makeId();
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, id); } catch { /* continue in memory */ }
    setProfileId(id); setState({}); setProblemText(''); setImage(null); setChoice(''); setReasoning(''); setError(''); setShowHistory(false); setShowDiagram(false); setFeedbackTags([]); setFeedbackNote(''); setFeedbackOpen(false); setShowLearningPlan(false);
  }
  function chooseNewProblem() { setFeedbackTags([]); setFeedbackNote(''); setFeedbackOpen(false); setShowLearningPlan(false); setState({}); setProblemText(''); setImage(null); setChoice(''); setReasoning(''); setError(''); setShowDiagram(false); }
  async function callTutor({ start = false, repetition = false } = {}) {
    setBusy(true); setError('');
    const question = start ? null : state.currentQuestion || null;
    const answer = start ? null : choice || null;
    const theorem = start ? problemText.trim() : state.theorem || '';
    const body = {
      theorem,
      image: start && image ? { mimeType: image.mimeType, data: image.data } : undefined,
      phase: start ? 'Step 1' : currentStep === 1 ? 'Step 1' : currentStep === 3 ? 'Step 3' : 'Step 2',
      stage: start ? 'diagnostic' : stage,
      mode: repetition ? 'repetition' : state.mode || 'guided',
      difficulty: state.difficulty || 'adaptive',
      currentQuestion: question,
      answer,
      reasoning: answer ? reasoning : '',
      history: start ? [] : history.slice(-8).map(item => ({ question: item.question.prompt, choice: item.choice, isCorrect: item.isCorrect, skill: item.question.skill, reasoning: item.reasoning, feedback: item.feedback })),
      diagnosticsCount: start ? 0 : Math.min(10, state.diagnosticsCount || 0),
      learnerFeedback: start ? { tags: [], note: '' } : { tags: feedbackTags, note: feedbackNote },
      diagramRequested: Boolean(showDiagram),
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
      const responseFeedback = cleanTutorText(output.feedback || '');
      const responseExplanation = cleanTutorText(output.explanation || '');
      const updatedHistory = start ? [] : answer && question ? [...history, { question, choice: answer, reasoning, feedback: responseFeedback, explanation: responseExplanation, isCorrect: output.answerCorrect ?? null, time: Date.now() }] : history;
      const diagnosticCount = start ? 0 : Math.min(10, (state.diagnosticsCount || 0) + (answer && stage === 'diagnostic' ? 1 : 0));
      const nextStage = start ? 'diagnostic' : stage === 'repetition' ? 'repetition' : stage === 'proof' || (stage !== 'diagnostic' && stepFor(output.phase) === 3) ? 'proof' : stage === 'learning' || diagnosticCount >= 10 || stepFor(output.phase) > 1 ? 'learning' : 'diagnostic';
      if (stage === 'diagnostic' && nextStage === 'learning') setShowLearningPlan(true);
      setState({
        theorem: recognizedProblem,
        phase: nextStage === 'diagnostic' ? 'Step 1' : nextStage === 'proof' ? 'Step 3' : 'Step 2',
        stage: nextStage,
        learningPlan: output.learningPlan || { focus: cleanTutorText(output.diagnosedSkill || nextQuestion.skill || 'Your problem'), nextMove: 'Work on the idea that needs attention, then reconstruct the proof and revisit it later.' },
        currentQuestion: nextQuestion,
        lastQuestion: answer && question ? question : state.lastQuestion,
        history: updatedHistory,
        mode: repetition || state.mode === 'repetition' ? 'repetition' : 'guided',
        diagnosticsCount: diagnosticCount,
        feedback: responseFeedback,
        explanation: responseExplanation,
        verdict: answer ? output.answerCorrect : null,
        diagnosedSkill: cleanTutorText(output.diagnosedSkill || ''),
        difficulty: nextQuestion.difficulty || output.difficulty || state.difficulty || 'standard'
      });
      if (start) { setProblemText(''); setImage(null); }
      setChoice(''); setReasoning(''); setShowDiagram(false); setFeedbackTags([]); setFeedbackNote('');
    } catch (e: any) { setError(e?.message || 'Could not reach the tutor. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  function beginLesson() {
    if (!problemText.trim() && !image) { setError('Paste your problem here or attach a clear image of it.'); return; }
    if (problemText.trim().length > 12000) { setError('Keep the problem text under 12,000 characters.'); return; }
    setState({}); setChoice(''); setReasoning(''); setShowDiagram(false);
    void callTutor({ start: true });
  }
  function enterRepetition(target?: Question) {
    const question = target || repeatedQuestion;
    if (!question) { setError('Answer a question first; then you can repeat it here.'); return; }
    setState(prev => ({ ...prev, currentQuestion: question, lastQuestion: question, mode: 'repetition', stage: 'repetition', feedback: '', explanation: '', verdict: null, phase: 'Repetition' }));
    setChoice(''); setReasoning(''); setShowDiagram(false); setError('');
  }
  async function attachImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Use a JPG, PNG, or WebP image.'); return; }
    if (file.size > 4 * 1024 * 1024) { setError('Choose an image smaller than 4 MB.'); return; }
    try { const data = await imageData(file); setImage({ mimeType: file.type, data, name: file.name, preview: URL.createObjectURL(file) }); setError(''); }
    catch (e: any) { setError(e.message || 'Could not open that image.'); }
  }
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pastedImage = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))?.getAsFile();
    if (pastedImage) { event.preventDefault(); void attachImage(pastedImage); }
  }
  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const droppedImage = Array.from(event.dataTransfer.files).find(file => file.type.startsWith('image/'));
    if (droppedImage) void attachImage(droppedImage);
  }
  const answerLabel = (item: Attempt) => item.choice === 'F' ? "I don't know yet" : item.question.options['ABCDE'.indexOf(item.choice)] || item.choice;

  return <div className="app">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><div className="brandmark"><BookOpen size={21} /></div><div><div className="brandtitle">VIRTUAL ADAPTIVE<br /><span>TEACHING ASSISTANT</span></div><div className="brandsub">PERSONAL STUDY SPACE</div></div><button className="mobileClose" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="sidegroup"><div className="sidetitle">YOUR LEARNING PATH</div>
        <div className="pathMeter"><div className="pathMeterTop"><span>{attempts ? 'Answer accuracy' : 'Learning progress'}</span><strong>{attempts ? `${progressValue}%` : 'Ready'}</strong></div><div className="pathMeterTrack"><span style={{ width: `${attempts ? progressValue : 4}%` }} /></div><div className="pathMeterFoot"><span>{correct} correct</span><span>{currentStreak ? `${currentStreak} in a row` : `${attempts} answered`}</span></div></div>
        {[1, 2, 3].map(step => <div className={`phase ${currentStep === step ? 'selected' : ''} ${currentStep > step ? 'completed' : ''}`} key={step}><div className="phase-index">{currentStep > step ? <Check size={14} /> : step}</div><span>Step {step}</span><i /></div>)}
        <button className={`repetitionLink ${state.mode === 'repetition' ? 'selected' : ''}`} disabled={!active && !history.length} onClick={() => state.mode === 'repetition' ? setState(prev => ({ ...prev, mode: 'guided', stage: 'learning', phase: 'Step 2' })) : enterRepetition()}><RotateCcw size={16} /> REPITITION MODE</button>
      </div>
      <div className="sidebarFoot"><ShieldCheck size={17} /><span>Your learning history stays in this browser.</span></div>
    </aside>

    <main className="main">
      <header className="topbar"><button className="menuButton" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Open menu"><Menu size={21} /></button><div className="crumb">Study space <ChevronRight size={15} /> <span>{state.theorem ? 'Current problem' : 'Start with your problem'}</span></div><div className="topright"><span className="localBadge"><span className="liveDot" /> Anonymous session</span><button className="newLearner" onClick={createNewLearner}>New learner</button></div></header>
      <div className={`content ${active ? 'chatContent' : 'startContent'}`}>
        {!active && !state.theorem && <section className="welcomeChat">
          <div className="welcomeMark"><BookOpen size={24} /></div><div className="eyebrow"><span className="eyedot" /> YOUR PERSONAL LEARNING SPACE</div>
          <h1>What problem are<br className="desktopBreak" /> you working on?</h1>
          <p className="intro">Paste it here or upload a photo. We’ll begin with one question and adjust the pace to your answers.</p>
          <div className="composer startComposer" onPaste={handlePaste} onDragOver={event => event.preventDefault()} onDrop={handleDrop}>
            <textarea aria-label="Math problem" rows={4} placeholder="Paste a theorem, exercise, or proof question…" value={problemText} onChange={e => { setProblemText(e.target.value); setError(''); }} disabled={busy} />
            {image && <div className="imageAttachment"><img src={image.preview} alt="Selected problem" /><span>{image.name}</span><button aria-label="Remove image" onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); }}><X size={16} /></button></div>}
            <div className="composerActions"><label className="attachButton"><Paperclip size={19} /><span>Upload image</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void attachImage(e.target.files?.[0])} /></label><span className="inputHint">No account needed</span><button className="sendButton" onClick={beginLesson} disabled={busy || (!problemText.trim() && !image)} aria-label="Begin with this problem">{busy ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={21} />}</button></div>
          </div>
          <div className="pasteHint"><span>Tip</span> Paste a screenshot with <kbd>⌘ V</kbd> / <kbd>Ctrl V</kbd>, or drag it into the box.</div>
          {error && <div className="error" role="alert">{error}</div>}
          <p className="privacyHint"><ShieldCheck size={15} /> Your progress is saved only in this browser.</p>
        </section>}

        {active && <>
          <div className="activeTop"><div><div className="eyebrow"><span className="eyedot" /> {state.mode === 'repetition' ? 'REPITITION MODE' : `STEP ${currentStep}`}</div><h1 className="activeTitle">Let’s work through it.</h1></div><button className="button secondary changeProblem" onClick={chooseNewProblem}>New problem</button></div>
          <section className="chatThread" aria-label="Tutoring conversation">
            <div className="learningStatus"><strong>{stage === 'diagnostic' ? `Getting to know you · ${Math.min(10, state.diagnosticsCount || 0)} / 10 answered` : stage === 'repetition' ? 'Revisit and remember' : stage === 'proof' ? 'Put the proof together' : 'Your targeted learning has begun'}</strong><p>{stage === 'diagnostic' ? 'A short check, then we work directly on your problem. Never more than 10 diagnostic questions.' : state.learningPlan?.nextMove || 'Work on the ideas you need, build the proof, then revisit it for retention.'}</p>{stage !== 'diagnostic' && state.learningPlan?.focus && <span>Focus: {state.learningPlan.focus}</span>}</div>
            <div className="userBubble problemBubble"><span className="bubbleLabel">YOUR PROBLEM</span><div><MathText text={state.theorem || ''} /></div></div>
            {state.feedback && attempts === 0 && <div className="assistantMessage"><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble"><div className="messageLabel">LET’S BEGIN</div><p><MathText text={state.feedback} /></p>{state.explanation && <p className="explanationText"><MathText text={state.explanation} /></p>}</div></div>}
            {history.map((item, index) => <React.Fragment key={`${item.time}-${index}`}>
              <div className="userBubble answerBubble"><span className="bubbleLabel">YOUR ANSWER</span><p><MathText text={answerLabel(item)} /></p>{item.reasoning && <p className="answerReasoning">{item.reasoning}</p>}</div>
              <div className="assistantMessage"><div className={`assistantMark ${item.isCorrect ? 'markCorrect' : item.isCorrect === false ? 'markReview' : ''}`}>{item.isCorrect ? <Check size={17} /> : <BookOpen size={17} />}</div><div className={`assistantBubble ${item.isCorrect === false ? 'reviewBubble' : item.isCorrect ? 'correctBubble' : ''}`}><div className="messageLabel">{item.isCorrect ? 'CORRECT' : item.isCorrect === false ? 'LET’S REVIEW THIS' : 'TUTOR'}</div><p><MathText text={item.feedback} /></p>{item.explanation && <p className="explanationText"><MathText text={item.explanation} /></p>}<button className="inlineRepeat" onClick={() => enterRepetition(item.question)}><RotateCcw size={14} /> Repeat this question</button></div></div>
            </React.Fragment>)}

            {<div className="assistantMessage currentTurn"><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble questionBubble">
              <div className="questionMeta"><span>{active.skill || 'Problem reasoning'}</span><span className="metaDot" /> <span>Adaptive · {active.difficulty || state.difficulty || 'finding your pace'}</span><button className="iconButton" title="Repeat this question" aria-label="Repeat this question" onClick={() => enterRepetition(active)}><RotateCcw size={16} /></button></div>
              <div className="questionPrompt"><MathText text={active.prompt} /></div>
              {active.diagram?.type && active.diagram.type !== 'none' && <><button className="visualToggle" onClick={() => setShowDiagram(!showDiagram)}>{showDiagram ? 'Hide visual' : 'Show a visual'} <ChevronRight size={15} className={showDiagram ? 'chevronOpen' : ''} /></button>{showDiagram && <SequenceDiagram diagram={active.diagram} />}</>}
              <div className="options" role="radiogroup" aria-label="Choose one answer">{(active.options || []).map((option, index) => <button key={`${index}-${option}`} className={`option ${choice === 'ABCDE'[index] ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'ABCDE'[index]} onClick={() => setChoice('ABCDE'[index])} disabled={busy}><span className="optionLetter">{'ABCDE'[index]}</span><span className="optionText"><MathText text={option.replace(/^[A-E][.)]\s*/, '')} /></span><span className="optionRadio" /></button>)}<button className={`option unknown ${choice === 'F' ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'F'} onClick={() => setChoice('F')} disabled={busy}><span className="optionLetter">F</span><span className="optionText">I don't know yet</span><span className="optionRadio" /></button></div>
              <label className="reasoningLabel" htmlFor="reason">Optional reasoning</label><textarea id="reason" className="reasonField" rows={2} value={reasoning} onChange={e => setReasoning(e.target.value)} placeholder="Add a thought if you’d like, or leave this blank." disabled={busy} />
              <div className="submitBar"><button className="feedbackLink" onClick={() => setFeedbackOpen(true)}>Tell me what would help{feedbackTags.length || feedbackNote ? ' · saved' : ' (optional)'}</button><button className="button primary" disabled={busy || !choice} onClick={() => void callTutor()}>{busy ? 'Checking…' : 'Send answer'} {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={17} />}</button></div>
            </div></div>}
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
    {(feedbackOpen || showLearningPlan) && <div className="dialogBackdrop" onClick={() => { setFeedbackOpen(false); setShowLearningPlan(false); }}><section className="studentDialog" role="dialog" aria-modal="true" aria-label={showLearningPlan ? 'Your learning plan' : 'Tell me what would help'} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { setFeedbackOpen(false); setShowLearningPlan(false); } if (event.key === 'Tab') { const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, textarea')); const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><button className="dialogClose" aria-label="Close popup" onClick={() => { setFeedbackOpen(false); setShowLearningPlan(false); }}><X size={20} /></button>{showLearningPlan ? <><h2>Let’s start learning.</h2><p>We have enough to begin. Your next questions focus on the ideas you need for this problem.</p><div className="planFocus"><strong>{state.learningPlan?.focus}</strong><p>{state.learningPlan?.nextMove}</p></div><p>Targeted practice → build the proof → revisit and remember.</p><button className="button primary" autoFocus onClick={() => setShowLearningPlan(false)}>Start learning</button></> : <><h2>What would help?</h2><p>Choose any that fit, write a note, or just close this. This is feedback, not a quiz.</p><div className="feedbackChips">{['A simpler explanation', 'An example', 'A useful diagram', 'A hint', 'More challenge', 'I’m ready to move on'].map(tag => <button key={tag} aria-pressed={feedbackTags.includes(tag)} className={feedbackTags.includes(tag) ? 'selected' : ''} onClick={() => setFeedbackTags(prev => prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag])}>{tag}</button>)}</div><textarea aria-label="Feedback note" value={feedbackNote} maxLength={2000} onChange={event => setFeedbackNote(event.target.value)} placeholder="Anything else? (optional)" /><p className="dialogHint">Your feedback will guide the next tutor response.</p><button className="button primary" autoFocus onClick={() => setFeedbackOpen(false)}>Done</button></>}</section></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
