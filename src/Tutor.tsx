import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseMath } from './math';
import { learningAction, applyActionState } from './learning-api';
import { validModules, moduleProgress, nextModule, validLesson, type Module, type Lesson } from './learning';
import { ArrowUp, BookOpen, Check, ChevronRight, LoaderCircle, Paperclip, RotateCcw, X } from 'lucide-react';
import 'katex/dist/katex.min.css';

type Diagram = { type: 'sequence' | 'numberLine' | 'mapping' | 'none'; caption: string; labels?: string[] };
type Question = { moduleId?: string; prompt: string; options: string[]; correctAnswer?: string; skill?: string; difficulty?: string; diagram?: Diagram; questionId?: string };
type Attempt = { teachingBefore?: Lesson; reasoningSound?: boolean | null; question: Question; choice: string; reasoning: string; feedback: string; explanation: string; isCorrect: boolean | null; time: number; stage?: string };
type ContentBlock = { type:'paragraph'|'derivation'|'callout'; text:string };
export type ConversationMessage = { id:string; role:'student'|'tutor'|'system'; kind:'problem'|'question'|'answer'|'clarification'|'explanation'|'phase'; text?:string; question?:Question; choice?:string; reasoning?:string; verdict?:boolean|null; blocks?:ContentBlock[]; phase?:number; createdAt:number };
type LearningStage='orientation'|'prerequisite-mapping'|'diagnostic'|'mistake-check'|'diagnostic-choice'|'verification'|'learning'|'training'|'proof'|'integration'|'solution'|'transfer'|'repetition';
export type LearnerState = { controllerToken?: string; returnStage?: LearningStage; draftProblem?: string; draftChoice?: string; draftReasoning?: string; draftFeedback?: string; draftTags?: string[]; problemImage?: ImageInput; awaitingContinue?: boolean; modules?: Module[]; teaching?: Lesson; gaps?: Gap[]; selectedFocus?: string; diagnosisSummary?: string; theorem?: string; phase?: string; currentQuestion?: Question; stage?: LearningStage; learningPlan?: { focus: string; nextMove: string }; history?: Attempt[]; messages?:ConversationMessage[]; mode?: 'guided' | 'repetition'; diagnosticsCount?: number; diagnosticChoiceRequired?:boolean; feedback?: string; explanation?: string; verdict?: boolean | null; diagnosedSkill?: string; difficulty?: string; lastQuestion?: Question; readiness?: Record<string, {status:string;observations:number;soundObservations:number;angles?:string[];objectives?:string[];target?:number;level?:string}>; remediation?: Record<string,{needed?:boolean;status?:string;target?:number;level?:string}>; integrationPlan?: Array<{id:string;concept?:string;question:Question}>; integrationAccepted?: string[]; integrationWork?: Record<string,string>; integrationFeedback?: Record<string,string>; solutionUnlocked?: boolean; verifiedSolution?: {steps:Array<{math:string;explanation:string}>;commonMistakes?:string[];interpretations?:string[]}; transferExercises?: Record<string,string>; transferFeedback?: Record<string,string>; retrievalStarted?: boolean; retrievalCount?:number; retrievalOpeningComplete?:boolean };
type ImageInput = { mimeType: string; data: string; name: string; preview: string };
type Gap = { skill: string; feedback: string; explanation: string; secure?: boolean };

const API_URL = (import.meta.env.VITE_API_URL || 'https://proofwise-api.irtiza-proofwise.workers.dev').replace(/\/$/, '');
export function MathText({ text = '' }: { text?: string }) {
  return <>{parseMath(text).map((part, index) => part.math === undefined ? <span key={index} className={part.error ? 'mathFallback' : undefined} title={part.error ? 'Unsupported or incomplete LaTeX; showing source.' : undefined}>{part.text}</span> : <span key={index} className={part.block ? 'mathBlock' : 'mathInline'} dangerouslySetInnerHTML={{ __html: part.html! }} />)}</>;
}
function cleanTutorText(value = '') { return String(value).replace(/\b(?:Proofwise|Math Mastery)\b/gi, 'LLM-TA for Math Learning').replace(/\bV2\b/gi, ''); }
const messageId=()=>globalThis.crypto?.randomUUID?.()||`message-${Date.now()}-${Math.random()}`;
function migratedMessages(state:LearnerState):ConversationMessage[]{
  if(state.messages?.length)return state.messages;
  const messages:ConversationMessage[]=[];
  if(state.theorem)messages.push({id:messageId(),role:'student',kind:'problem',text:state.theorem,createdAt:0});
  for(const item of state.history||[]){
    messages.push({id:messageId(),role:'tutor',kind:'question',question:item.question,createdAt:item.time-2});
    messages.push({id:messageId(),role:'student',kind:'answer',choice:item.choice,reasoning:item.reasoning,text:item.choice==='F'?"I don't know yet":item.question.options['ABCDE'.indexOf(item.choice)]||item.choice,createdAt:item.time-1});
    messages.push({id:messageId(),role:'tutor',kind:'explanation',verdict:item.isCorrect,blocks:[item.feedback&&{type:'paragraph',text:item.feedback},item.explanation&&{type:'derivation',text:item.explanation}].filter(Boolean) as ContentBlock[],createdAt:item.time});
  }
  return messages;
}
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
async function prepareImage(file: File): Promise<File> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Please crop the screenshot to the problem, or use an image under 25 MB.');
  const source = URL.createObjectURL(file);
  try {
    const picture = new Image(); picture.src = source;
    await picture.decode();
    if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth * picture.naturalHeight > 60_000_000) throw new Error('Please crop this image to the mathematical problem.');
    const canvas = document.createElement('canvas');
    let scale = Math.min(1, 2200 / Math.max(picture.naturalWidth, picture.naturalHeight));
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
      const context = canvas.getContext('2d'); if (!context) throw new Error('Image preparation is unavailable. Try pasting the problem text.');
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(.65, .9 - attempt * .05)));
      if (blob && blob.size <= 700_000) return new File([blob], 'problem-image.jpg', { type: 'image/jpeg' });
      scale *= .82;
    }
    throw new Error('Please crop the screenshot to the problem so its symbols remain readable.');
  } finally { URL.revokeObjectURL(source); }
}

function TeachingCard({ lesson }: { lesson: Lesson }) {
  return <div className="teachingCard"><h3>{lesson.title}</h3><p><MathText text={lesson.concept} /></p><div className="workedExample"><strong>A worked example</strong><p><MathText text={lesson.workedExample} /></p></div><p className="lessonConnection"><strong>Back to your problem</strong><br /><MathText text={lesson.connection} /></p></div>;
}
function SequenceDiagram({ diagram }: { diagram: Diagram }) {
  if (diagram.type === 'none') return null;
  if (diagram.type === 'numberLine') return <div className="visualCard"><div className="visualLine"><span className="visualInterval" /><span className="visualPoint left" /><span className="visualPoint center" /><span className="visualPoint right" /></div><div className="visualLabels"><span>{diagram.labels?.[0] || 'start'}</span><span>{diagram.labels?.[1] || 'middle'}</span><span>{diagram.labels?.[2] || 'target'}</span></div><p>{diagram.caption}</p></div>;
  if (diagram.type === 'mapping') return <div className="visualCard mappingVisual"><div><span>{diagram.labels?.[0] || 'Input'}</span><b>x</b><b>y</b><b>z</b></div><svg viewBox="0 0 180 120" aria-hidden="true"><path d="M20 28 C90 25 88 31 150 31 M20 60 C90 58 89 62 150 60 M20 92 C92 88 90 48 150 60" fill="none" stroke="#438b77" strokeWidth="2" markerEnd="url(#arrow)"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#438b77" /></marker></defs></svg><div><span>{diagram.labels?.[1] || 'Output'}</span><b>f(x)</b><b>f(y)</b><b>f(z)</b></div><p>{diagram.caption}</p></div>;
  return <div className="visualCard sequenceVisual"><svg viewBox="0 0 760 170" role="img" aria-label="Later sequence terms and the convergent subsequence approach the same limit"><rect x="315" y="28" width="415" height="87" rx="18" fill="#e9f2ed"/><line x1="35" y1="107" x2="728" y2="107" stroke="#a2aaa5" strokeWidth="2"/><line x1="286" y1="15" x2="286" y2="131" stroke="#438b77" strokeWidth="2" strokeDasharray="6 6"/><text x="277" y="14" fill="#438b77" fontSize="16">N</text>{[68,145,222,343,422,503,584,670].map((x,i)=><g key={x}><circle cx={x} cy="107" r="9" fill={x<286?'#a0aaa4':'#438b77'}/><text x={x-4} y="139" fill="#748079" fontSize="12">{i+1}</text></g>)}<circle cx="503" cy="107" r="20" fill="none" stroke="#29866f" strokeWidth="4"/><text x="497" y="65" fill="#29866f" fontSize="15">x</text></svg><p>{diagram.caption || 'A late term can be chosen close to the limit.'}</p></div>;
}
function ThreadMessage({message}:{message:ConversationMessage}){
  if(message.role==='system')return <div className="phaseMessage"><span>{message.text}</span></div>;
  if(message.role==='student')return <div className="userBubble answerBubble"><span className="bubbleLabel">{message.kind==='problem'?'PROBLEM':message.kind==='clarification'?'STUDENT':'YOUR ANSWER'}</span><p><MathText text={message.text}/></p>{message.reasoning&&<p className="answerReasoning"><MathText text={message.reasoning}/></p>}</div>;
  if(message.kind==='question'&&message.question)return <div className="assistantMessage pastQuestion"><div className="assistantMark"><BookOpen size={17}/></div><div className="assistantBubble"><div className="messageLabel">QUESTION</div><div className="questionPrompt"><MathText text={message.question.prompt}/></div><details className="pastOptions"><summary>View choices</summary>{message.question.options.map((option,index)=><p key={index}><strong>{'ABCDE'[index]}.</strong> <MathText text={option.replace(/^[A-E][.):]\s*/,'')}/></p>)}</details>{message.question.diagram?.type&&message.question.diagram.type!=='none'&&<SequenceDiagram diagram={message.question.diagram}/>}</div></div>;
  return <div className="assistantMessage"><div className={`assistantMark ${message.verdict===true?'markCorrect':message.verdict===false?'markReview':''}`}>{message.verdict===true?<Check size={17}/>:<BookOpen size={17}/>}</div><div className={`assistantBubble ${message.verdict===false?'reviewBubble':message.verdict===true?'correctBubble':''}`}>{message.verdict!==undefined&&<div className="messageLabel">{message.verdict===true?'CORRECT':message.verdict===false?'LET’S REVIEW THIS':'TUTOR'}</div>}{(message.blocks||[]).map((block,index)=><div key={index} className={block.type==='derivation'?'explanationText':block.type==='callout'?'notice':''}><MathText text={block.text}/></div>)}</div></div>;
}

export function Tutor({ initial, onSave, priorEvidence, phase, onPhase, sessionId, courseId, conversationActions }: { initial: LearnerState; onSave: (state: LearnerState) => void; priorEvidence: unknown[]; phase: number; onPhase: (phase: number) => void; sessionId: string; courseId: string; conversationActions?: React.ReactNode }) {
  const currentTurnRef = useRef<HTMLDivElement>(null);
  const [atLatest,setAtLatest]=useState(true);
  const imageTask = useRef(0);
  const requestController = useRef<AbortController>();
  useEffect(() => () => requestController.current?.abort(), []);
  const [state, setState] = useState<LearnerState>(initial);
  const [problemText, setProblemText] = useState(initial.draftProblem || initial.theorem || '');
  const [image, setImage] = useState<ImageInput | null>(initial.problemImage ? { ...initial.problemImage, preview: `data:${initial.problemImage.mimeType};base64,${initial.problemImage.data}` } : null);
  const [choice, setChoice] = useState(initial.draftChoice || '');
  const [reasoning, setReasoning] = useState(initial.draftReasoning || '');
  const [busy, setBusy] = useState(false);
  const [preparingImage, setPreparingImage] = useState(false);
  const [reviewProblem, setReviewProblem] = useState(false);
  const [pendingStart, setPendingStart] = useState<any>(null);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showDiagram, setShowDiagram] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTags, setFeedbackTags] = useState<string[]>(initial.draftTags || []);
  const [feedbackNote, setFeedbackNote] = useState(initial.draftFeedback || '');
  const [showLearningPlan, setShowLearningPlan] = useState(false);
  const [showNext, setShowNext] = useState(initial.awaitingContinue === false || !initial.feedback || !initial.history?.length);


  useEffect(() => { onSave({ ...state, draftProblem: problemText, draftChoice: choice, draftReasoning: reasoning, draftFeedback: feedbackNote, draftTags: feedbackTags, problemImage: image ? { ...image, preview: '' } : state.problemImage, awaitingContinue: !showNext }); }, [state, problemText, choice, reasoning, feedbackNote, feedbackTags, image, showNext]);
  useEffect(() => () => { if (image?.preview) URL.revokeObjectURL(image.preview); }, [image]);
  const history = state.history || [];
  const messages = useMemo(()=>migratedMessages(state),[state.messages,state.history,state.theorem]);
  const attempts = history.length;
  const currentStreak = correctStreak(history);
  const active = state.currentQuestion;
  const stage = state.mode === 'repetition' ? 'repetition' : state.stage || (Math.min(10, state.diagnosticsCount || 0) >= 10 || stepFor(state.phase) > 1 ? 'learning' : 'diagnostic');
  const currentStep = stage === 'repetition' ? 0 : stage === 'diagnostic' ? 1 : stage === 'proof' ? 3 : 2;
  useEffect(()=>{const check=()=>setAtLatest(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-180);check();window.addEventListener('scroll',check,{passive:true});return()=>window.removeEventListener('scroll',check);},[]);
  useEffect(() => { if (atLatest&&messages.length) currentTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [state.currentQuestion?.prompt, messages.length]);
  const repeatedQuestion = useMemo(() => [...history].reverse().find(item => item.isCorrect === false)?.question || history.at(-1)?.question || state.lastQuestion || active, [history, state.lastQuestion, active]);

  function acceptTutorOutput(output: any, start: boolean, theorem: string, question: Question | null, answer: string | null, repetition: boolean, focusSkill = '') {
      const recognizedProblem = cleanTutorText(output.problem || theorem);
      if (!recognizedProblem.trim()) throw new Error('I could not read a clear problem from that image. Try a sharper photo or paste the problem text.');
      const nextQuestion: Question = output.nextQuestion ? {
        ...output.nextQuestion, prompt: cleanTutorText(output.nextQuestion.prompt),
        options: output.nextQuestion.options.map((item: string) => cleanTutorText(item)),
        skill: cleanTutorText(output.nextQuestion.skill || ''),
        diagram: output.nextQuestion.diagram && typeof output.nextQuestion.diagram === 'object' ? output.nextQuestion.diagram : { type: 'none', caption: '' }
      } : state.currentQuestion!;
      const responseFeedback = cleanTutorText(output.feedback || '');
      const responseExplanation = cleanTutorText(output.explanation || '');
      const modules: Module[] = validModules(state.modules) && !start ? state.modules! : validModules(output.prerequisites) ? output.prerequisites : [];
      const teaching = validLesson(output.teaching) ? output.teaching : undefined;
      const verdict = answer && question ? output.answerCorrect === true ? true : output.answerCorrect === false ? false : null : null;
      const updatedHistory: Attempt[] = start ? [] : answer && question ? [...history, { question, teachingBefore: state.teaching, reasoningSound: typeof output.reasoningSound === 'boolean' ? output.reasoningSound : null, choice: answer, reasoning, feedback: responseFeedback, explanation: responseExplanation, isCorrect: verdict, time: Date.now(), stage }] : history;
      const now=Date.now(),updatedMessages:ConversationMessage[]=start?[
        {id:messageId(),role:'student',kind:'problem',text:recognizedProblem,createdAt:now},
        {id:messageId(),role:'tutor',kind:'explanation',blocks:(output.contentBlocks||[responseFeedback&&{type:'paragraph',text:responseFeedback},responseExplanation&&{type:'derivation',text:responseExplanation}]).filter(Boolean),phase:0,createdAt:now+1}
      ]:[...messages];
      if(!start&&answer&&question){
        updatedMessages.push({id:messageId(),role:'tutor',kind:'question',question,createdAt:now});
        updatedMessages.push({id:messageId(),role:'student',kind:'answer',choice:answer,reasoning,text:answer==='F'?"I don't know yet":question.options['ABCDE'.indexOf(answer)]||answer,createdAt:now+1});
        updatedMessages.push({id:messageId(),role:'tutor',kind:'explanation',verdict,blocks:(output.contentBlocks||[responseFeedback&&{type:'paragraph',text:responseFeedback},responseExplanation&&{type:'derivation',text:responseExplanation}]).filter(Boolean),phase:output.phase,createdAt:now+2});
      }else if(!start&&!answer&&(feedbackNote.trim()||feedbackTags.length)){
        updatedMessages.push({id:messageId(),role:'student',kind:'clarification',text:[...feedbackTags,feedbackNote.trim()].filter(Boolean).join(' · '),createdAt:now});
        updatedMessages.push({id:messageId(),role:'tutor',kind:'explanation',blocks:(output.contentBlocks||[responseFeedback&&{type:'paragraph',text:responseFeedback},responseExplanation&&{type:'derivation',text:responseExplanation}]).filter(Boolean),phase:output.phase,createdAt:now+1});
      }
      const diagnosticCount = Number.isInteger(output.diagnosticsCount) ? output.diagnosticsCount : (state.diagnosticsCount || 0);
      const completedDiagnosis = diagnosticCount >= 10;
      const nextStage = start ? 'diagnostic' : output.stage === 'training' ? 'learning' : output.stage || stage;
      if (stage === 'diagnostic' && nextStage === 'learning') setShowLearningPlan(true);
      const gaps: Gap[] = start ? [] : [...(state.gaps || [])];
      if (question && answer && verdict === false) {
        const skill = cleanTutorText(question.skill || output.diagnosedSkill || 'Problem reasoning');
        const gap = { skill, feedback: responseFeedback, explanation: responseExplanation, secure: false };
        const index = gaps.findIndex(item => item.skill.toLowerCase() === skill.toLowerCase());
        if (index < 0) gaps.push(gap); else gaps[index] = gap;
      }
      setState({ ...state, controllerToken: output.controllerToken || state.controllerToken, problemImage: image || state.problemImage, modules, teaching, gaps, messages:updatedMessages, diagnosticChoiceRequired:output.diagnosticChoiceRequired===true, readiness:output.readiness||state.readiness, remediation:output.remediation||state.remediation, solutionUnlocked:output.solutionUnlocked===true, selectedFocus: focusSkill || state.selectedFocus, diagnosisSummary: stage === 'diagnostic' && nextStage === 'learning' ? (gaps.length ? 'These ideas need focused practice.' : 'The diagnostic minimum is complete. Choose whether to continue diagnosis or begin topic training.') : state.diagnosisSummary, theorem: recognizedProblem, phase: output.phase===0?'Step 0':output.phase===1?'Step 1':output.phase===2?'Step 2':output.phase===3?'Step 3':output.phase===4?'Step 4':output.phase===5?'Step 5':output.phase===6?'Step 6':state.phase, stage: nextStage,
        learningPlan: output.learningPlan || { focus: cleanTutorText(output.diagnosedSkill || nextQuestion.skill || 'Your problem'), nextMove: 'Work on the idea that needs attention, then reconstruct the solution and revisit it later.' },
        currentQuestion: nextQuestion, lastQuestion: answer && question ? question : state.lastQuestion, history: updatedHistory,
        mode: !focusSkill && (repetition || state.mode === 'repetition') ? 'repetition' : 'guided', diagnosticsCount: diagnosticCount,
        feedback: responseFeedback, explanation: responseExplanation, verdict, diagnosedSkill: cleanTutorText(output.diagnosedSkill || ''), difficulty: nextQuestion.difficulty || output.difficulty || state.difficulty || 'standard'
      });
      if (answer && question) setShowNext(true);
      if (start) { setProblemText(''); setImage(null); }
      setChoice(''); setReasoning(''); setShowDiagram(false); setFeedbackTags([]); setFeedbackNote(''); setReviewProblem(false); setPendingStart(null);
  }
  async function callTutor({ start = false, repetition = false, textOnly = false, focusSkill = '' } = {}) {
    setBusy(true); setError('');
    requestController.current?.abort();
    const controller = new AbortController(); requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 65000);
    const question = start ? null : state.currentQuestion || null;
    const answer = start || focusSkill ? null : choice || null;
    const theorem = start ? problemText.trim() : state.theorem || '';
    const pendingHistory = history;
    const modules = validModules(state.modules) ? state.modules! : [];
    const currentModule = modules.find(m => m.id === question?.moduleId);
      const target = focusSkill ? modules.find(m => m.title === focusSkill) : stage === 'learning' && currentModule && !moduleProgress(currentModule, pendingHistory).ready ? currentModule : stage !== 'repetition' ? nextModule(modules, pendingHistory) : undefined;
    const body = {
      courseId,
      sessionId,
      controllerToken: start ? undefined : state.controllerToken,
      coursePrior: priorEvidence, // Context only: never used to bypass diagnosis.
      prerequisites: start ? [] : modules,
      moduleProgress: modules.map(m => moduleProgress(m, pendingHistory)),
      selectedModule: start ? '' : target?.id || '',
      lessonStart: Boolean(focusSkill),
      theorem,
      image: start && image && !textOnly ? { mimeType: image.mimeType, data: image.data } : undefined,
      phase: start ? 'Step 1' : currentStep === 1 ? 'Step 1' : currentStep === 3 ? 'Step 3' : 'Step 2',
      stage: start ? 'diagnostic' : focusSkill ? 'learning' : stage,
      focusSkill,
      mode: focusSkill ? 'guided' : repetition ? 'repetition' : state.mode || 'guided',
      difficulty: state.difficulty || 'adaptive',
      currentQuestion: question,
      answer,
      reasoning: answer ? reasoning : '',
        history: start ? [] : history.slice(-8).map(item => ({ question: item.question.prompt, choice: item.choice, isCorrect: item.isCorrect, skill: item.question.skill, moduleId: item.question.moduleId, reasoningSound: item.reasoningSound, reasoning: item.reasoning, feedback: item.feedback })),
      diagnosticsCount: start ? 0 : Math.min(10, state.diagnosticsCount || 0),
      consecutiveCorrect: start ? 0 : answer && question ? answer === question.correctAnswer ? Math.min(5, currentStreak + 1) : 0 : Math.min(5, currentStreak),
      learnerFeedback: start ? { tags: [], note: '' } : { tags: feedbackTags, note: feedbackNote },
      diagramRequested: Boolean(showDiagram),
    };
    try {
      const response = await fetch(`${API_URL}/tutor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      let output: any;
      try { output = await response.json(); } catch { throw new Error(response.status === 413 ? 'The image could not be accepted by the tutor server. Please crop it to the problem. The server may need its latest update deployed.' : `The tutor returned an unreadable response (${response.status}).`); }
      if (response.status === 413) throw new Error('Image upload is temporarily unavailable. Paste the problem text to continue.');
      if (!response.ok) throw new Error(output.error || `Tutor request failed (${response.status}).`);
      const actionOnly=['mistake-check','diagnostic-choice'].includes(output.stage);
      if ((!actionOnly&&(!output.nextQuestion || typeof output.nextQuestion.prompt !== 'string' || !Array.isArray(output.nextQuestion.options) || output.nextQuestion.options.length !== 5 || !output.nextQuestion.options.every((item: any) => typeof item === 'string') || new Set(output.nextQuestion.options.map((item: string) => item.trim().toLowerCase())).size !== 5)) || typeof output.controllerToken !== 'string') throw new Error('The tutor returned an incomplete or unauthenticated response. Please try again.');
      if (start && image && !textOnly) {
        setProblemText(cleanTutorText(output.problem || theorem)); setPendingStart(output); setReviewProblem(true);
      } else acceptTutorOutput(output, start, theorem, question, answer, repetition, focusSkill);
    } catch (e: any) { setError(e?.message || 'Could not reach the tutor. Check your connection and try again.'); }
    finally { clearTimeout(timeout); setBusy(false); }
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
    setState(prev => ({ ...prev, returnStage: prev.stage === 'repetition' ? prev.returnStage : prev.stage, currentQuestion: question, lastQuestion: question, mode: 'repetition', stage: 'repetition', feedback: '', explanation: '', teaching: undefined, verdict: null, phase: 'Repetition' }));
    setChoice(''); setReasoning(''); setShowDiagram(false); setError(''); setShowNext(true);
  }
  async function beginRetrieval() {
    if(!state.controllerToken){setError('Start or resume this problem before beginning retrieval.');return;}
    setBusy(true);setError('');
    try {
      const output=await learningAction({action:'start-retrieval',courseId,sessionId,controllerToken:state.controllerToken});
      const next=output.nextQuestion;
      if(!next?.prompt||!Array.isArray(next.options)||next.options.length!==5)throw new Error('The tutor returned an incomplete retrieval question.');
      setState(prev=>({...prev,...applyActionState(prev,output),currentQuestion:next,lastQuestion:next,mode:'repetition',stage:'repetition',retrievalStarted:true,returnStage:prev.mode==='repetition'?prev.returnStage:prev.stage,feedback:'',explanation:'',teaching:undefined,awaitingContinue:true}));
      setChoice('');setReasoning('');setShowNext(true);
    }catch(e:any){setError(e?.message||'Retrieval practice could not start.');}finally{setBusy(false);}
  }
  async function controllerAction(action:'mistake-decision'|'continue-diagnosis'|'finish-diagnosis',extra:Record<string,unknown>={}){
    if(!state.controllerToken)return;
    setBusy(true);setError('');
    try{
      const output=await learningAction({action,courseId,sessionId,controllerToken:state.controllerToken,...extra});
      const next=applyActionState(state,output);
      setState({...next,currentQuestion:output.nextQuestion||(action==='finish-diagnosis'?undefined:next.currentQuestion),messages:[...messages,{id:messageId(),role:'student',kind:'clarification',text:action==='mistake-decision'?(extra.accidental?'Yes, that was a silly mistake.':'No, this reflects a real gap.'):action==='continue-diagnosis'?'Continue diagnosis.':'Move to topic training.',createdAt:Date.now()},{id:messageId(),role:'system',kind:'phase',text:action==='finish-diagnosis'?'Phase 3 · Topic training':action==='continue-diagnosis'?'Diagnosis continued':extra.accidental?'A fresh same-skill verification is required.':'The gap will be trained directly.',phase:output.phase,createdAt:Date.now()+1}]});
      setShowNext(true);setChoice('');setReasoning('');
    }catch(e:any){setError(e?.message||'The learning state could not be updated.');}finally{setBusy(false);}
  }
  async function answerRetrieval(){
    if(!state.controllerToken||!active?.questionId||!choice)return;
    setBusy(true);setError('');
    try{
      const output=await learningAction({action:'answer-retrieval',courseId,sessionId,controllerToken:state.controllerToken,questionId:active.questionId,choice,reasoning});
      const verdict=output.answerCorrect===true?true:output.answerCorrect===false?false:null,now=Date.now();
      setState({...applyActionState(state,output),messages:[...messages,{id:messageId(),role:'tutor',kind:'question',question:active,createdAt:now},{id:messageId(),role:'student',kind:'answer',choice,reasoning,text:choice==='F'?"I don't know yet":active.options['ABCDE'.indexOf(choice)]||choice,createdAt:now+1},{id:messageId(),role:'tutor',kind:'explanation',verdict,blocks:[{type:'paragraph',text:output.feedback||''}],phase:6,createdAt:now+2}],currentQuestion:output.nextQuestion,mode:'repetition',stage:'repetition',retrievalStarted:true});
      setChoice('');setReasoning('');setShowNext(true);
    }catch(e:any){setError(e?.message||'REPITITION could not continue.');}finally{setBusy(false);}
  }
  async function attachImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { setError('Use a JPG, PNG, or WebP image.'); return; }
    const task = ++imageTask.current; setPreparingImage(true);
    try { const prepared = await prepareImage(file); const data = await imageData(prepared); if (task !== imageTask.current) return; setImage({ mimeType: prepared.type, data, name: file.name || 'Pasted screenshot', preview: URL.createObjectURL(prepared) }); setReviewProblem(false); setPendingStart(null); setError(''); }
    catch (e: any) { setError(e.message || 'Could not open that image.'); } finally { if (task === imageTask.current) setPreparingImage(false); }
  }
  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (busy || preparingImage) return;
    const pastedImage = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))?.getAsFile();
    if (pastedImage) { event.preventDefault(); void attachImage(pastedImage); }
  }
  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (busy || preparingImage) return;
    const droppedImage = Array.from(event.dataTransfer.files).find(file => file.type.startsWith('image/'));
    if (droppedImage) void attachImage(droppedImage);
  }
  const answerLabel = (item: Attempt) => item.choice === 'F' ? "I don't know yet" : item.question.options['ABCDE'.indexOf(item.choice)] || item.choice;

  return <div className="app tutorEmbed">
    <main className="main">
      <div className={`content ${active ? 'chatContent' : 'startContent'}`}>
        {!active && <section className="welcomeChat">
          <div className="composer startComposer" onPaste={handlePaste} onDragOver={event => event.preventDefault()} onDrop={handleDrop}>
            <label className="problemInputLabel" htmlFor="problem-input">Problem (text or LaTeX)</label><textarea id="problem-input" aria-label="Math problem" rows={4} placeholder="Paste a mathematical problem, derivation, or exercise…" value={problemText} onChange={e => { setProblemText(e.target.value); setPendingStart(null); setError(''); }} disabled={busy} />
            {problemText.trim() && <div className="transcriptionPreview" aria-label="Problem preview"><span className="bubbleLabel">{reviewProblem ? 'Recognized problem · check before starting' : 'Preview'}</span><MathText text={problemText} /></div>}
            {image && <div className="imageAttachment"><img src={image.preview} alt="Selected problem" /><span>{image.name}</span><button aria-label="Remove image" onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); setState(prev => ({ ...prev, problemImage: undefined })); }}><X size={16} /></button></div>}
            <div className="composerActions"><label className="attachButton"><Paperclip size={19} /><span>Upload image</span><input disabled={busy || preparingImage} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void attachImage(e.target.files?.[0])} /></label><button className="sendButton" onClick={() => reviewProblem && pendingStart ? acceptTutorOutput(pendingStart, true, problemText, null, null, false) : reviewProblem ? void callTutor({ start: true, textOnly: true }) : beginLesson()} disabled={busy || preparingImage || (!problemText.trim() && !image)} aria-label="Begin with this problem">{busy || preparingImage ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={21} />}</button></div>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
        </section>}

        {active && <>
          <div className="historyToolbar">{state.mode === 'repetition'&&<><span>REPITITION · {state.retrievalCount||0} answered{!state.retrievalOpeningComplete?' · opening retrieval requires 10':''}</span><button className="textButton" disabled={busy} onClick={async()=>{if(!state.controllerToken)return;setBusy(true);try{const output=await learningAction({action:'stop-retrieval',courseId,sessionId,controllerToken:state.controllerToken});setState({...applyActionState(state,output),mode:'guided'});}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>Stop REPITITION</button></>}</div>
          <section className="chatThread" aria-label="Tutoring conversation">
            {messages.map(message=><ThreadMessage key={message.id} message={message}/>)}
            {false && (showHistory ? history : !showNext ? history.slice(-1) : []).map((item, index) => <React.Fragment key={`${item.time}-${index}`}>
              {item.teachingBefore && <TeachingCard lesson={item.teachingBefore} />}
              <div className="assistantMessage pastQuestion"><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble"><div className="messageLabel">QUESTION</div><div className="questionPrompt"><MathText text={item.question.prompt} /></div><details className="pastOptions"><summary>View choices</summary>{item.question.options.map((option, optionIndex) => <p key={optionIndex}><strong>{'ABCDE'[optionIndex]}.</strong> <MathText text={option.replace(/^[A-E][.):]\s*/, '')} /></p>)}</details></div></div>
              <div className="userBubble answerBubble"><span className="bubbleLabel">YOUR ANSWER</span><p><MathText text={answerLabel(item)} /></p>{item.reasoning && <p className="answerReasoning"><MathText text={item.reasoning}/></p>}</div>
              <div className="assistantMessage"><div className={`assistantMark ${item.isCorrect ? 'markCorrect' : item.isCorrect === false ? 'markReview' : ''}`}>{item.isCorrect ? <Check size={17} /> : <BookOpen size={17} />}</div><div className={`assistantBubble ${item.isCorrect === false ? 'reviewBubble' : item.isCorrect ? 'correctBubble' : ''}`}><div className="messageLabel">{item.isCorrect ? 'CORRECT' : item.isCorrect === false ? 'LET’S REVIEW THIS' : 'TUTOR'}</div><p><MathText text={item.feedback} /></p>{item.explanation && <p className="explanationText"><MathText text={item.explanation} /></p>}<button className="inlineRepeat" disabled={busy} onClick={() => enterRepetition(item.question)}><RotateCcw size={14} /> Repeat this question</button></div></div>
            </React.Fragment>)}

            {stage==='mistake-check'&&<div className="assistantMessage currentTurn"><div className="assistantMark"><BookOpen size={17}/></div><div className="assistantBubble"><p>Do you consider that incorrect response a silly mistake?</p><div className="submitBar"><button className="button secondary" disabled={busy} onClick={()=>void controllerAction('mistake-decision',{accidental:false})}>No, train the gap</button><button className="button primary" disabled={busy} onClick={()=>void controllerAction('mistake-decision',{accidental:true})}>Yes, verify it</button></div></div></div>}
            {stage==='diagnostic-choice'&&<div className="assistantMessage currentTurn"><div className="assistantMark"><BookOpen size={17}/></div><div className="assistantBubble"><div className="messageLabel">DIAGNOSTIC CHECKPOINT</div><p>At least ten diagnostic questions are complete. You can continue diagnosis or begin targeted topic training. Uncertainty and identified gaps remain recorded.</p><div className="submitBar"><button className="button secondary" disabled={busy} onClick={()=>void controllerAction('continue-diagnosis')}>Continue diagnosis</button><button className="button primary" disabled={busy} onClick={()=>void controllerAction('finish-diagnosis')}>Move to topic training</button></div></div></div>}
            {stage === 'learning' && (state.modules || []).length > 0 && <div className="topicChooser"><label htmlFor="topic-focus">Targeted topic</label><select id="topic-focus" disabled={busy} value={active.moduleId || ''} onChange={event => { const module = state.modules?.find(m => m.id === event.target.value); if (module) { setShowNext(true); void callTutor({ focusSkill: module.title }); } }}><option value="" disabled>Choose a prerequisite</option>{state.modules?.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></div>}
            <div ref={currentTurnRef}>{state.teaching && <TeachingCard lesson={state.teaching} />}</div>
            {!['mistake-check','diagnostic-choice'].includes(stage)&&(stage==='repetition'||phase<=3)&&(showNext || !history.length) && <div className="assistantMessage currentTurn" ><div className="assistantMark"><BookOpen size={17} /></div><div className="assistantBubble questionBubble">
              <div className="questionMeta">{stage === 'diagnostic' && <span>Question {(state.diagnosticsCount || 0) + 1} / 10 · </span>}<span>{active.skill || 'Problem reasoning'}</span><span className="metaDot" /> <span>Adaptive · {active.difficulty || state.difficulty || 'standard'}</span><button className="iconButton" title="Repeat this question" aria-label="Repeat this question" disabled={busy} onClick={() => enterRepetition(active)}><RotateCcw size={16} /></button></div>
              <div className="questionPrompt"><MathText text={active.prompt} /></div>
              {active.diagram?.type && active.diagram.type !== 'none' && <><button className="visualToggle" onClick={() => setShowDiagram(!showDiagram)}>{showDiagram ? 'Hide visual' : 'Show a visual'} <ChevronRight size={15} className={showDiagram ? 'chevronOpen' : ''} /></button>{showDiagram && <SequenceDiagram diagram={active.diagram} />}</>}
              <div className="options" role="radiogroup" aria-label="Choose one answer" onKeyDown={event => { if (busy || !['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')); const index = radios.indexOf(document.activeElement as HTMLButtonElement); const next = (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : 5)) % 6; setChoice('ABCDEF'[next]); radios[next]?.focus(); }}>{(active.options || []).map((option, index) => <button key={`${index}-${option}`} className={`option ${choice === 'ABCDE'[index] ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'ABCDE'[index]} onClick={() => setChoice('ABCDE'[index])} disabled={busy}><span className="optionLetter">{'ABCDE'[index]}</span><span className="optionText"><MathText text={option.replace(/^[A-E][.):]\s*/, '')} /></span><span className="optionRadio" /></button>)}<button className={`option unknown ${choice === 'F' ? 'chosen' : ''}`} role="radio" aria-checked={choice === 'F'} onClick={() => setChoice('F')} disabled={busy}><span className="optionLetter">F</span><span className="optionText">I don't know yet</span><span className="optionRadio" /></button></div>
              <label className="reasoningLabel" htmlFor="reason">Optional reasoning</label><textarea id="reason" className="reasonField" rows={2} value={reasoning} onChange={e => setReasoning(e.target.value)} placeholder="Your reasoning (text or LaTeX)" disabled={busy} />
              {reasoning.trim() && <div className="mathPreview" aria-label="Reasoning preview"><MathText text={reasoning}/></div>}
              <div className="submitBar"><button className="feedbackLink" onClick={() => setFeedbackOpen(true)}>Optional feedback{feedbackTags.length || feedbackNote ? ' · saved' : ''}</button><button className="button primary" disabled={busy || (!choice && !feedbackNote.trim() && !feedbackTags.length)} onClick={() => void (stage==='repetition'&&choice?answerRetrieval():callTutor())}>{busy ? 'Checking…' : choice ? 'Submit answer' : 'Send feedback'} {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowUp size={17} />}</button></div>
            </div></div>}
            {error && <div className="error" role="alert">{error}</div>}
            {conversationActions}
          </section>
          {!atLatest&&<button className="latestButton" onClick={()=>currentTurnRef.current?.scrollIntoView({behavior:'smooth',block:'end'})}>Return to latest ↓</button>}
          {false&&showHistory && <div className="historyCard"><strong>Answered questions</strong></div>}

        </>}
      </div>
    </main>
    {(feedbackOpen || showLearningPlan) && <div className="dialogBackdrop" onClick={() => { setFeedbackOpen(false); setShowLearningPlan(false); }}><section className="studentDialog" role="dialog" aria-modal="true" aria-label={showLearningPlan ? 'Your learning plan' : 'Optional feedback'} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { setFeedbackOpen(false); setShowLearningPlan(false); } if (event.key === 'Tab') { const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, textarea')); const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><button className="dialogClose" aria-label="Close popup" onClick={() => { setFeedbackOpen(false); setShowLearningPlan(false); }}><X size={20} /></button>{showLearningPlan ? <><h2>Topic training</h2><div className="planFocus"><strong>{state.learningPlan?.focus}</strong><p><MathText text={state.learningPlan?.nextMove}/></p></div><button className="button primary" autoFocus onClick={() => setShowLearningPlan(false)}>Start learning</button></> : <><h2>Optional feedback</h2><div className="feedbackChips">{['A simpler explanation', 'An example', 'A useful diagram', 'A hint', 'More challenge', 'I’m ready to move on'].map(tag => <button key={tag} aria-pressed={feedbackTags.includes(tag)} className={feedbackTags.includes(tag) ? 'selected' : ''} onClick={() => setFeedbackTags(prev => prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag])}>{tag}</button>)}</div><textarea aria-label="Feedback note" value={feedbackNote} maxLength={2000} onChange={event => setFeedbackNote(event.target.value)} placeholder="Anything else? (optional)" /><button className="button primary" autoFocus onClick={() => setFeedbackOpen(false)}>Done</button></>}</section></div>}
  </div>;
}
