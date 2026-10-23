import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseMath } from './math';
import { learningAction, applyActionState } from './learning-api';
import { validModules, moduleProgress, nextModule, validLesson, type Module, type Lesson } from './learning';
import { ArrowUp, BookOpen, Check, ChevronRight, LoaderCircle, Paperclip, X } from 'lucide-react';
import 'katex/dist/katex.min.css';

type Diagram = { type: 'sequence' | 'numberLine' | 'mapping' | 'none'; caption: string; labels?: string[] };
type Question = { moduleId?: string; prompt: string; options: string[]; correctAnswer?: string; skill?: string; difficulty?: string; diagram?: Diagram; questionId?: string };
type Attempt = { teachingBefore?: Lesson; reasoningSound?: boolean | null; question: Question; choice: string; reasoning: string; feedback: string; explanation: string; isCorrect: boolean | null; time: number; stage?: string };
type ContentBlock = { type:'paragraph'|'derivation'|'callout'; text:string };
export type ConversationMessage = { id:string; role:'student'|'tutor'|'system'; kind:'problem'|'question'|'answer'|'clarification'|'explanation'|'phase'|'transfer'|'action'; text?:string; question?:Question; choice?:string; reasoning?:string; verdict?:boolean|null; blocks?:ContentBlock[]; phase?:number; createdAt:number; active?:boolean; activity?:'guided'|'integration'|'retrieval'|'transfer'; activityId?:string; actionKey?:'mistake'|'diagnostic'|'integration'|'unlock'|'transfer-near'|'transfer-mid'|'transfer-wider'|'retrieval-start'|'retrieval-stop'; distance?:'near'|'mid'|'wider' };
type LearningStage='orientation'|'prerequisite-mapping'|'diagnostic'|'mistake-check'|'diagnostic-choice'|'verification'|'learning'|'training'|'proof'|'integration'|'solution'|'transfer'|'repetition';
export type LearnerState = { controllerToken?: string; returnStage?: LearningStage; draftProblem?: string; draftChoice?: string; draftReasoning?: string; draftFeedback?: string; draftTags?: string[]; problemImage?: ImageInput; awaitingContinue?: boolean; modules?: Module[]; teaching?: Lesson; gaps?: Gap[]; selectedFocus?: string; diagnosisSummary?: string; theorem?: string; phase?: string; currentQuestion?: Question; stage?: LearningStage; learningPlan?: { focus: string; nextMove: string }; history?: Attempt[]; messages?:ConversationMessage[]; mode?: 'guided' | 'repetition'; diagnosticsCount?: number; diagnosticChoiceRequired?:boolean; feedback?: string; explanation?: string; verdict?: boolean | null; diagnosedSkill?: string; difficulty?: string; lastQuestion?: Question; readiness?: Record<string, {status:string;observations:number;soundObservations:number;angles?:string[];objectives?:string[];target?:number;level?:string}>; remediation?: Record<string,{needed?:boolean;status?:string;target?:number;level?:string}>; integrationPlan?: Array<{id:string;concept?:string;question:Question}>; integrationAccepted?: string[]; integrationWork?: Record<string,string>; integrationFeedback?: Record<string,string>; solutionUnlocked?: boolean; verifiedSolution?: {steps:Array<{math:string;explanation:string}>;commonMistakes?:string[];interpretations?:string[]}; transferExercises?: Record<string,string>; transferDrafts?: Record<string,string>; transferFeedback?: Record<string,string>; retrievalStarted?: boolean; retrievalCount?:number; retrievalOpeningComplete?:boolean };
type ImageInput = { mimeType: string; data: string; name: string; preview: string };
type Gap = { skill: string; feedback: string; explanation: string; secure?: boolean };

const API_URL = (import.meta.env.VITE_API_URL || 'https://proofwise-api.irtiza-proofwise.workers.dev').replace(/\/$/, '');
export function MathText({ text = '' }: { text?: string }) {
  return <>{parseMath(text).map((part, index) => part.math === undefined ? <span key={index} className={part.error ? 'mathFallback' : undefined} title={part.error ? 'Unsupported or incomplete LaTeX; showing source.' : undefined}>{part.text}</span> : <span key={index} className={part.block ? 'mathBlock' : 'mathInline'} dangerouslySetInnerHTML={{ __html: part.html! }} />)}</>;
}
function cleanTutorText(value = '') { return String(value).replace(/\b(?:Proofwise|Math Mastery)\b/gi, 'LLM-TA for Math Learning').replace(/\bV2\b/gi, ''); }
const messageId=()=>globalThis.crypto?.randomUUID?.()||`message-${Date.now()}-${Math.random()}`;
const closeAction=(thread:ConversationMessage[],key:ConversationMessage['actionKey'])=>thread.map(message=>message.kind==='action'&&message.actionKey===key&&message.active?{...message,active:false}:message);
const visibleQuestion=(question:Question):Question=>{const {correctAnswer:_hidden,...visible}=question;return visible;};
function migrateSavedActivities(messages:ConversationMessage[],state:LearnerState):ConversationMessage[]{
  const thread=[...messages];let time=Math.max(0,...thread.map(message=>message.createdAt||0))+1;
  const add=(message:Omit<ConversationMessage,'createdAt'|'id'>&{id?:string;createdAt?:number})=>{
    const id=message.id||`migrated-${message.kind}-${message.phase??'x'}-${thread.length}`;
    if(thread.some(existing=>existing.id===id))return;
    thread.push({...message,id,createdAt:message.createdAt??time++} as ConversationMessage);
  };
  if(state.modules?.length&&!thread.some(message=>message.phase===1)){
    const orientation=thread.find(message=>message.phase===0),problem=thread.find(message=>message.kind==='problem');
    add({role:'tutor',kind:'explanation',phase:1,blocks:[{type:'paragraph',text:`Prerequisites identified: ${state.modules.map(module=>module.title).join(', ')}.`}],createdAt:orientation?.createdAt!==undefined?orientation.createdAt+.5:problem?.createdAt!==undefined?problem.createdAt+.5:time});
  }
  const integrationIds=new Set((state.integrationPlan||[]).map(step=>step.id));
  for(const message of thread){
    if(message.kind==='question'&&message.question&&integrationIds.has(message.question.questionId||''))message.activity='integration';
  }
  for(const step of state.integrationPlan||[]){
    const questionId=step.question.questionId||step.id;
    if(thread.some(message=>message.kind==='question'&&(message.question?.questionId===questionId||message.question?.questionId===step.id)))continue;
    add({role:'tutor',kind:'question',activity:'integration',activityId:step.id,question:visibleQuestion({...step.question,questionId}),phase:4});
    const work=state.integrationWork?.[step.id],feedback=state.integrationFeedback?.[step.id];
    if(work)add({role:'student',kind:'answer',text:work,phase:4});
    if(feedback)add({role:'tutor',kind:'explanation',phase:4,blocks:[{type:'paragraph',text:feedback}]});
  }
  if(state.solutionUnlocked&&state.verifiedSolution?.steps?.length&&!thread.some(message=>message.phase===5&&message.kind==='explanation')){
    add({role:'system',kind:'phase',phase:5,text:'Verified solution unlocked.'});
    const blocks:ContentBlock[]=state.verifiedSolution.steps.flatMap(step=>[{type:'derivation' as const,text:step.math},{type:'paragraph' as const,text:step.explanation}]);
    if(state.verifiedSolution.commonMistakes?.length)blocks.push({type:'paragraph',text:`Common points to check: ${state.verifiedSolution.commonMistakes.join('; ')}`});
    if(state.verifiedSolution.interpretations?.length)blocks.push({type:'paragraph',text:state.verifiedSolution.interpretations.join('\n')});
    add({role:'tutor',kind:'explanation',phase:5,blocks});
  }
  for(const distance of ['near','mid','wider'] as const){
    const exercise=state.transferExercises?.[distance];
    if(!exercise||thread.some(message=>message.kind==='transfer'&&message.distance===distance))continue;
    add({role:'tutor',kind:'transfer',activity:'transfer',activityId:distance,distance,text:exercise,phase:6});
    const work=state.transferDrafts?.[distance]||state.integrationWork?.[`transfer-${distance}`];
    if(work)add({role:'student',kind:'answer',text:work,phase:6});
    const feedback=state.transferFeedback?.[distance];
    if(feedback)add({role:'tutor',kind:'explanation',phase:6,blocks:[{type:'paragraph',text:feedback}]});
  }
  return thread.sort((a,b)=>a.createdAt-b.createdAt);
}
function migratedMessages(state:LearnerState):ConversationMessage[]{
  if(state.messages?.length){
    const messages=migrateSavedActivities(state.messages,state);
    const activeQuestion=state.currentQuestion;
    const represented=activeQuestion&&messages.some(message=>message.active&&message.kind==='question'&&(activeQuestion.questionId?message.question?.questionId===activeQuestion.questionId:message.question?.prompt===activeQuestion.prompt));
    if(activeQuestion&&!represented)messages.push({id:`active-${activeQuestion.questionId||'legacy-current-question'}`,role:'tutor',kind:'question',question:visibleQuestion(activeQuestion),active:true,activity:state.mode==='repetition'?'retrieval':state.stage==='integration'?'integration':'guided',activityId:activeQuestion.questionId||'legacy-current-question',createdAt:(messages.at(-1)?.createdAt||Date.now())+1});
    return messages.sort((a,b)=>a.createdAt-b.createdAt);
  }
  const messages:ConversationMessage[]=[];
  if(state.theorem)messages.push({id:messageId(),role:'student',kind:'problem',text:state.theorem,createdAt:0});
  for(const [index,item] of (state.history||[]).entries()){
    messages.push({id:`migrated-question-${item.time}-${index}`,role:'tutor',kind:'question',question:visibleQuestion(item.question),activity:item.stage==='repetition'?'retrieval':undefined,createdAt:item.time-2});
    messages.push({id:`migrated-answer-${item.time}-${index}`,role:'student',kind:'answer',choice:item.choice,reasoning:item.reasoning,text:item.choice==='F'?"I don't know yet":item.question.options['ABCDE'.indexOf(item.choice)]||item.choice,createdAt:item.time-1});
    messages.push({id:`migrated-evaluation-${item.time}-${index}`,role:'tutor',kind:'explanation',verdict:item.isCorrect,blocks:[item.feedback&&{type:'paragraph',text:item.feedback},item.explanation&&{type:'derivation',text:item.explanation}].filter(Boolean) as ContentBlock[],createdAt:item.time});
  }
  if(state.modules?.length)messages.push({id:'migrated-prerequisites',role:'tutor',kind:'explanation',blocks:[{type:'paragraph',text:`Prerequisites identified: ${state.modules.map(module=>module.title).join(', ')}.`}],phase:1,createdAt:1});
  const migrated=migrateSavedActivities(messages,state);
  if(state.currentQuestion)migrated.push({id:`active-${state.currentQuestion.questionId||'legacy-current-question'}`,role:'tutor',kind:'question',question:visibleQuestion(state.currentQuestion),active:true,activity:state.mode==='repetition'?'retrieval':state.stage==='integration'?'integration':'guided',activityId:state.currentQuestion.questionId||'legacy-current-question',createdAt:(migrated.at(-1)?.createdAt||Date.now())+1});
  return migrated.sort((a,b)=>a.createdAt-b.createdAt);
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

function SequenceDiagram({ diagram }: { diagram: Diagram }) {
  if (diagram.type === 'none') return null;
  if (diagram.type === 'numberLine') return <div className="visualCard"><div className="visualLine"><span className="visualInterval" /><span className="visualPoint left" /><span className="visualPoint center" /><span className="visualPoint right" /></div><div className="visualLabels"><span>{diagram.labels?.[0] || 'start'}</span><span>{diagram.labels?.[1] || 'middle'}</span><span>{diagram.labels?.[2] || 'target'}</span></div><p>{diagram.caption}</p></div>;
  if (diagram.type === 'mapping') return <div className="visualCard mappingVisual"><div><span>{diagram.labels?.[0] || 'Input'}</span><b>x</b><b>y</b><b>z</b></div><svg viewBox="0 0 180 120" aria-hidden="true"><path d="M20 28 C90 25 88 31 150 31 M20 60 C90 58 89 62 150 60 M20 92 C92 88 90 48 150 60" fill="none" stroke="#438b77" strokeWidth="2" markerEnd="url(#arrow)"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#438b77" /></marker></defs></svg><div><span>{diagram.labels?.[1] || 'Output'}</span><b>f(x)</b><b>f(y)</b><b>f(z)</b></div><p>{diagram.caption}</p></div>;
  return <div className="visualCard sequenceVisual"><svg viewBox="0 0 760 170" role="img" aria-label="Later sequence terms and the convergent subsequence approach the same limit"><rect x="315" y="28" width="415" height="87" rx="18" fill="#e9f2ed"/><line x1="35" y1="107" x2="728" y2="107" stroke="#a2aaa5" strokeWidth="2"/><line x1="286" y1="15" x2="286" y2="131" stroke="#438b77" strokeWidth="2" strokeDasharray="6 6"/><text x="277" y="14" fill="#438b77" fontSize="16">N</text>{[68,145,222,343,422,503,584,670].map((x,i)=><g key={x}><circle cx={x} cy="107" r="9" fill={x<286?'#a0aaa4':'#438b77'}/><text x={x-4} y="139" fill="#748079" fontSize="12">{i+1}</text></g>)}<circle cx="503" cy="107" r="20" fill="none" stroke="#29866f" strokeWidth="4"/><text x="497" y="65" fill="#29866f" fontSize="15">x</text></svg><p>{diagram.caption || 'A late term can be chosen close to the limit.'}</p></div>;
}
export function ThreadMessage({message,activeContent}:{message:ConversationMessage;activeContent?:React.ReactNode}){
  if(message.role==='system')return <div className="phaseMessage"><span>{message.text}</span></div>;
  if(message.role==='student')return <div className="userBubble answerBubble"><span className="bubbleLabel">{message.kind==='problem'?'PROBLEM':message.kind==='clarification'?'STUDENT':'YOUR ANSWER'}</span><p><MathText text={message.text}/></p>{message.reasoning&&<p className="answerReasoning"><MathText text={message.reasoning}/></p>}</div>;
  if(message.kind==='question'&&message.question)return <div className={`assistantMessage ${message.active?'':'pastQuestion'}`}><div className="assistantMark"><BookOpen size={17}/></div><div className="assistantBubble"><div className="messageLabel">{message.activity==='integration'?'INTEGRATION':message.activity==='retrieval'?'REPITITION':message.activity==='guided'?'QUESTION':'QUESTION'}</div><div className="questionPrompt"><MathText text={message.question.prompt}/></div>{message.active?activeContent:<details className="pastOptions"><summary>{message.choice?`Your answer: ${message.choice}`:'View answer choices'}</summary>{message.question.options.map((option,index)=><p key={index} className={message.choice==='ABCDE'[index]?'selectedHistoricalOption':''}><strong>{'ABCDE'[index]}{message.choice==='ABCDE'[index]?' · selected':''}.</strong> <MathText text={option.replace(/^[A-E][.):]\s*/,'')}/></p>)}<p className={message.choice==='F'?'selectedHistoricalOption':''}><strong>F{message.choice==='F'?' · selected':''}.</strong> I don't know yet</p></details>}{message.question.diagram?.type&&message.question.diagram.type!=='none'&&<SequenceDiagram diagram={message.question.diagram}/>}</div></div>;
  if(message.kind==='transfer')return <div className="assistantMessage"><div className="assistantBubble"><div className="messageLabel">{message.distance?.toUpperCase()} TRANSFER</div><MathText text={message.text}/>{activeContent}</div></div>;
  if(message.kind==='action')return <div className="assistantMessage"><div className="assistantBubble"><div className="messageLabel">{message.text||'NEXT STEP'}</div>{activeContent}</div></div>;
  return <div className="assistantMessage"><div className={`assistantMark ${message.verdict===true?'markCorrect':message.verdict===false?'markReview':''}`}>{message.verdict===true?<Check size={17}/>:<BookOpen size={17}/>}</div><div className={`assistantBubble ${message.verdict===false?'reviewBubble':message.verdict===true?'correctBubble':''}`}>{message.verdict!==undefined&&<div className="messageLabel">{message.verdict===true?'CORRECT':message.verdict===false?'LET’S REVIEW THIS':'TUTOR'}</div>}{(message.blocks||[]).map((block,index)=><div key={index} className={block.type==='derivation'?'explanationText':block.type==='callout'?'notice':''}><MathText text={block.text}/></div>)}</div></div>;
}

function ActiveQuestion({question,label,choice,reasoning,busy,feedbackPending,feedbackAllowed=true,showDiagram,onChoice,onReasoning,onFeedback,onSubmit,onDiagram}:{question:Question;label?:string;choice:string;reasoning:string;busy:boolean;feedbackPending:boolean;feedbackAllowed?:boolean;showDiagram:boolean;onChoice:(choice:string)=>void;onReasoning:(text:string)=>void;onFeedback:()=>void;onSubmit:()=>void;onDiagram:()=>void}){
 return <div className="questionBubble"><div className="questionMeta">{label&&<span>{label}</span>}<span>{question.skill||'Mathematical reasoning'}</span>{question.difficulty&&<><span className="metaDot"/><span>{question.difficulty}</span></>}</div>
  {question.diagram?.type&&question.diagram.type!=='none'&&<><button className="visualToggle" disabled={busy} onClick={onDiagram}>{showDiagram?'Hide':'Show'} diagram <ChevronRight size={15}/></button>{showDiagram&&<SequenceDiagram diagram={question.diagram}/>}</>}
  <div className="options" role="radiogroup" aria-label="Choose one answer" onKeyDown={event=>{if(busy||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const radios=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));const index=radios.indexOf(document.activeElement as HTMLButtonElement);const next=(index+(event.key==='ArrowDown'||event.key==='ArrowRight'?1:5))%6;onChoice('ABCDEF'[next]);radios[next]?.focus();}}>{question.options.map((option,index)=><button key={`${index}-${option}`} className={`option ${choice==='ABCDE'[index]?'chosen':''}`} role="radio" aria-checked={choice==='ABCDE'[index]} onClick={()=>onChoice('ABCDE'[index])} disabled={busy}><span className="optionLetter">{'ABCDE'[index]}</span><span className="optionText"><MathText text={option.replace(/^[A-E][.):]\s*/,'')}/></span><span className="optionRadio"/></button>)}<button className={`option unknown ${choice==='F'?'chosen':''}`} role="radio" aria-checked={choice==='F'} onClick={()=>onChoice('F')} disabled={busy}><span className="optionLetter">F</span><span className="optionText">I don't know yet</span><span className="optionRadio"/></button></div>
  <label className="reasoningLabel">Optional reasoning<textarea className="reasonField" rows={2} value={reasoning} onChange={e=>onReasoning(e.target.value)} placeholder="Your reasoning (text or LaTeX)" disabled={busy}/></label>{reasoning.trim()&&<div className="mathPreview"><MathText text={reasoning}/></div>}
  <div className="submitBar">{feedbackAllowed?<button className="feedbackLink" disabled={busy} onClick={onFeedback}>Optional feedback{feedbackPending?' · saved':''}</button>:<span/>}<button className="button primary" disabled={busy||(!choice&&(!feedbackAllowed||!feedbackPending))} onClick={onSubmit}>{busy?'Checking…':choice?'Submit answer':'Send feedback'} {busy?<LoaderCircle size={17} className="spin"/>:<ArrowUp size={17}/>}</button></div>
 </div>;
}

export function Tutor({ initial, onSave, priorEvidence, phase, onPhase, sessionId, courseId }: { initial: LearnerState; onSave: (state: LearnerState) => void; priorEvidence: unknown[]; phase: number; onPhase: (phase: number) => void; sessionId: string; courseId: string }) {
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
  const requestGuard=useRef(false);
  function startRequest(){if(requestGuard.current)return false;requestGuard.current=true;setBusy(true);return true;}
  function finishRequest(){requestGuard.current=false;setBusy(false);}
  const [preparingImage, setPreparingImage] = useState(false);
  const [reviewProblem, setReviewProblem] = useState(false);
  const [pendingStart, setPendingStart] = useState<any>(null);
  const [error, setError] = useState('');
  const [showDiagram, setShowDiagram] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTags, setFeedbackTags] = useState<string[]>(initial.draftTags || []);
  const [feedbackNote, setFeedbackNote] = useState(initial.draftFeedback || '');


  useEffect(() => () => { if (image?.preview) URL.revokeObjectURL(image.preview); }, [image]);
  const history = state.history || [];
  const currentStreak = correctStreak(history);
  const active = state.currentQuestion;
  const stage = state.mode === 'repetition' ? 'repetition' : state.stage || (Math.min(10, state.diagnosticsCount || 0) >= 10 || stepFor(state.phase) > 1 ? 'learning' : 'diagnostic');
  const currentStep = stage === 'repetition' ? 0 : stage === 'diagnostic' ? 1 : stage === 'proof' ? 3 : 2;
  const messages = useMemo(()=>{
    const thread=migratedMessages(state);
    const activeAction=(actionKey:ConversationMessage['actionKey'],text:string)=>{
      if(!thread.some(message=>message.kind==='action'&&message.active&&message.actionKey===actionKey)){
        const instance=thread.filter(message=>message.kind==='action'&&message.actionKey===actionKey).length;
        thread.push({id:`action-${actionKey}-${instance}`,role:'tutor',kind:'action',actionKey,active:true,text,createdAt:(thread.at(-1)?.createdAt||Date.now())+1});
      }
    };
    if(stage==='mistake-check')activeAction('mistake','Was that incorrect response an accidental mistake, or does the idea need work?');
    else if(stage==='diagnostic-choice')activeAction('diagnostic','At least ten diagnostic questions are complete. Continue diagnosis or begin targeted training?');
    else if(phase===3&&!state.currentQuestion&&!state.integrationPlan?.length&&stage==='learning')activeAction('integration','The diagnosed prerequisites are ready. Begin gradual integration?');
    else if(phase===4&&state.integrationPlan?.length&&(state.integrationAccepted||[]).length===state.integrationPlan.length&&!state.solutionUnlocked)activeAction('unlock','All integration steps are accepted. Request the verified solution?');
    if(state.solutionUnlocked){
      if(!state.transferExercises?.near)activeAction('transfer-near','Generate a near-transfer exercise.');
      if(!state.transferExercises?.mid)activeAction('transfer-mid','Generate a mid-transfer exercise.');
      if(!state.transferExercises?.wider)activeAction('transfer-wider','Generate a wider-transfer exercise.');
    }
    if(state.mode==='repetition')activeAction('retrieval-stop','REPITITION is active.');
    else if((state.solutionUnlocked||phase>=3)&&state.controllerToken&&!state.currentQuestion)activeAction('retrieval-start','Start retrieval practice when you are ready.');
    return thread.sort((a,b)=>a.createdAt-b.createdAt);
  },[state,phase,stage]);
  useEffect(() => { onSave({ ...state, messages, draftProblem: problemText, draftChoice: choice, draftReasoning: reasoning, draftFeedback: feedbackNote, draftTags: feedbackTags, problemImage: image ? { ...image, preview: '' } : state.problemImage }); }, [state, messages, problemText, choice, reasoning, feedbackNote, feedbackTags, image]);
  useEffect(()=>{const check=()=>setAtLatest(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-180);check();window.addEventListener('scroll',check,{passive:true});return()=>window.removeEventListener('scroll',check);},[]);
  useEffect(() => { if (atLatest&&messages.length) currentTurnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [state.currentQuestion?.prompt, messages.length]);

  function acceptTutorOutput(output: any, start: boolean, theorem: string, question: Question | null, answer: string | null, repetition: boolean, focusSkill = '') {
      const recognizedProblem = cleanTutorText(output.problem || theorem);
      if (!recognizedProblem.trim()) throw new Error('I could not read a clear problem from that image. Try a sharper photo or paste the problem text.');
      const nextQuestion: Question | undefined = output.nextQuestion ? {
        ...output.nextQuestion, prompt: cleanTutorText(output.nextQuestion.prompt),
        options: output.nextQuestion.options.map((item: string) => cleanTutorText(item)),
        skill: cleanTutorText(output.nextQuestion.skill || ''),
        diagram: output.nextQuestion.diagram && typeof output.nextQuestion.diagram === 'object' ? output.nextQuestion.diagram : { type: 'none', caption: '' }
      } : undefined;
      const responseFeedback = cleanTutorText(output.feedback || '');
      const responseExplanation = cleanTutorText(output.explanation || '');
      const modules: Module[] = validModules(state.modules) && !start ? state.modules! : validModules(output.prerequisites) ? output.prerequisites : [];
      const teaching = validLesson(output.teaching) ? output.teaching : undefined;
      const verdict = answer && question ? output.answerCorrect === true ? true : output.answerCorrect === false ? false : null : null;
      const updatedHistory: Attempt[] = start ? [] : answer && question ? [...history, { question, teachingBefore: state.teaching, reasoningSound: typeof output.reasoningSound === 'boolean' ? output.reasoningSound : null, choice: answer, reasoning, feedback: responseFeedback, explanation: responseExplanation, isCorrect: verdict, time: Date.now(), stage }] : history;
      const now=Date.now(),updatedMessages:ConversationMessage[]=start?[
        {id:messageId(),role:'student',kind:'problem',text:recognizedProblem,createdAt:now},
        {id:messageId(),role:'tutor',kind:'explanation',blocks:(output.contentBlocks||[responseFeedback&&{type:'paragraph',text:responseFeedback},responseExplanation&&{type:'derivation',text:responseExplanation}]).filter(Boolean),phase:0,createdAt:now+1},
        ...(modules.length?[{id:messageId(),role:'tutor' as const,kind:'explanation' as const,blocks:[{type:'paragraph' as const,text:`Prerequisites for this problem: ${modules.map(module=>module.title).join(' → ')}.`}],phase:1,createdAt:now+2}]:[])
      ]:[...messages];
      if(!start&&answer&&question){
        const currentId=question.questionId;
        let found=false;
        const frozen=updatedMessages.map(message=>{
          if(message.kind==='question'&&message.active&&(!currentId||message.question?.questionId===currentId)){found=true;return {...message,active:false,choice:answer};}
          return message;
        });
        updatedMessages.splice(0,updatedMessages.length,...frozen);
        if(!found)updatedMessages.push({id:messageId(),role:'tutor',kind:'question',question,createdAt:now-1});
      }
      if(!start&&answer&&question){
        updatedMessages.push({id:messageId(),role:'student',kind:'answer',choice:answer,reasoning,text:answer==='F'?"I don't know yet":question.options['ABCDE'.indexOf(answer)]||answer,createdAt:now});
        updatedMessages.push({id:messageId(),role:'tutor',kind:'explanation',verdict,blocks:(output.contentBlocks||[responseFeedback&&{type:'paragraph',text:responseFeedback},responseExplanation&&{type:'derivation',text:responseExplanation}]).filter(Boolean),phase:output.phase,createdAt:now+1});
      }else if(!start&&!answer&&(feedbackNote.trim()||feedbackTags.length)){
        updatedMessages.push({id:messageId(),role:'student',kind:'clarification',text:[...feedbackTags,feedbackNote.trim()].filter(Boolean).join(' · '),createdAt:now});
        updatedMessages.push({id:messageId(),role:'tutor',kind:'explanation',blocks:(output.contentBlocks||[responseFeedback&&{type:'paragraph',text:responseFeedback},responseExplanation&&{type:'derivation',text:responseExplanation}]).filter(Boolean),phase:output.phase,createdAt:now+1});
      }
      if(teaching){
        const teachingBlocks:ContentBlock[]=[{type:'paragraph' as const,text:teaching.concept},{type:'derivation' as const,text:teaching.workedExample},{type:'paragraph' as const,text:teaching.connection}].filter(block=>Boolean(block.text));
        updatedMessages.push({id:messageId(),role:'tutor',kind:'explanation',blocks:teachingBlocks,phase:3,createdAt:now+2});
      }
      const actionCheckpoint=['mistake-check','diagnostic-choice'].includes(output.stage);
      if(nextQuestion&&(start||answer)&&!actionCheckpoint)updatedMessages.push({id:`active-${messageId()}`,role:'tutor',kind:'question',question:nextQuestion,active:true,activity:repetition||state.mode==='repetition'?'retrieval':'guided',activityId:nextQuestion.questionId,phase:output.phase,createdAt:now+(teaching?3:2)});
      const diagnosticCount = Number.isInteger(output.diagnosticsCount) ? output.diagnosticsCount : (state.diagnosticsCount || 0);
      const completedDiagnosis = diagnosticCount >= 10;
      const nextStage = start ? 'diagnostic' : output.stage === 'training' ? 'learning' : output.stage || stage;
      const gaps: Gap[] = start ? [] : [...(state.gaps || [])];
      if (question && answer && verdict === false) {
        const skill = cleanTutorText(question.skill || output.diagnosedSkill || 'Problem reasoning');
        const gap = { skill, feedback: responseFeedback, explanation: responseExplanation, secure: false };
        const index = gaps.findIndex(item => item.skill.toLowerCase() === skill.toLowerCase());
        if (index < 0) gaps.push(gap); else gaps[index] = gap;
      }
      setState({ ...state, controllerToken: output.controllerToken || state.controllerToken, problemImage: image || state.problemImage, modules, teaching, gaps, messages:updatedMessages, diagnosticChoiceRequired:output.diagnosticChoiceRequired===true, readiness:output.readiness||state.readiness, remediation:output.remediation||state.remediation, solutionUnlocked:output.solutionUnlocked===true, selectedFocus: focusSkill || state.selectedFocus, diagnosisSummary: stage === 'diagnostic' && nextStage === 'learning' ? (gaps.length ? 'These ideas need focused practice.' : 'The diagnostic minimum is complete. Choose whether to continue diagnosis or begin topic training.') : state.diagnosisSummary, theorem: recognizedProblem, phase: output.phase===0?'Step 0':output.phase===1?'Step 1':output.phase===2?'Step 2':output.phase===3?'Step 3':output.phase===4?'Step 4':output.phase===5?'Step 5':output.phase===6?'Step 6':state.phase, stage: nextStage,
        learningPlan: output.learningPlan || { focus: cleanTutorText(output.diagnosedSkill || nextQuestion?.skill || 'Your problem'), nextMove: 'Work on the idea that needs attention, then reconstruct the solution and revisit it later.' },
        currentQuestion: actionCheckpoint?undefined:start?nextQuestion:answer?nextQuestion:state.currentQuestion, lastQuestion: answer && question ? question : state.lastQuestion, history: updatedHistory,
        mode: !focusSkill && (repetition || state.mode === 'repetition') ? 'repetition' : 'guided', diagnosticsCount: diagnosticCount,
        feedback: responseFeedback, explanation: responseExplanation, verdict, diagnosedSkill: cleanTutorText(output.diagnosedSkill || ''), difficulty: nextQuestion?.difficulty || output.difficulty || state.difficulty || 'standard'
      });
      if (start) { setProblemText(''); setImage(null); }
      setChoice(''); setReasoning(''); setShowDiagram(false); setFeedbackTags([]); setFeedbackNote(''); setReviewProblem(false); setPendingStart(null);
  }
  async function callTutor({ start = false, repetition = false, textOnly = false, focusSkill = '' } = {}) {
    if(!startRequest())return; setError('');
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
    finally { clearTimeout(timeout); finishRequest(); }
  }
  function beginLesson() {
    if (!problemText.trim() && !image) { setError('Paste your problem here or attach a clear image of it.'); return; }
    if (problemText.trim().length > 12000) { setError('Keep the problem text under 12,000 characters.'); return; }
    setState({}); setChoice(''); setReasoning(''); setShowDiagram(false);
    void callTutor({ start: true });
  }
  async function beginRetrieval() {
    if(!state.controllerToken){setError('Start or resume this problem before beginning retrieval.');return;}
    if(!startRequest())return;setError('');
    try {
      const output=await learningAction({action:'start-retrieval',courseId,sessionId,controllerToken:state.controllerToken});
      const next=output.nextQuestion;
      if(!next?.prompt||!Array.isArray(next.options)||next.options.length!==5)throw new Error('The tutor returned an incomplete retrieval question.');
      const now=Date.now();
      setState(prev=>({...prev,...applyActionState(prev,output),currentQuestion:next,lastQuestion:next,mode:'repetition',stage:'repetition',retrievalStarted:true,returnStage:prev.mode==='repetition'?prev.returnStage:prev.stage,feedback:'',explanation:'',teaching:undefined,messages:[...closeAction(messages,'retrieval-start'),{id:messageId(),role:'student',kind:'clarification',text:'Start REPITITION.',createdAt:now},{id:messageId(),role:'system',kind:'phase',text:'REPITITION started.',phase:6,createdAt:now+1},{id:`active-${messageId()}`,role:'tutor',kind:'question',question:next,active:true,activity:'retrieval',activityId:next.questionId,phase:6,createdAt:now+2}]}));
      setChoice('');setReasoning('');
    }catch(e:any){setError(e?.message||'Retrieval practice could not start.');}finally{finishRequest();}
  }
  async function controllerAction(action:'mistake-decision'|'continue-diagnosis'|'finish-diagnosis',extra:Record<string,unknown>={}){
    if(!state.controllerToken)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action,courseId,sessionId,controllerToken:state.controllerToken,...extra});
      const next=applyActionState(state,output);
      const actionKey=action==='mistake-decision'?'mistake':'diagnostic';
      const now=Date.now(),thread:ConversationMessage[]=[...closeAction(messages,actionKey),{id:messageId(),role:'student',kind:'clarification',text:action==='mistake-decision'?(extra.accidental?'Yes, please verify that response with a new question.':'No, train the underlying idea.'):action==='continue-diagnosis'?'Continue diagnosis.':'Begin targeted topic training.',createdAt:now},{id:messageId(),role:'system',kind:'phase',text:action==='finish-diagnosis'?'Topic training is available.':action==='continue-diagnosis'?'Diagnosis continues.':extra.accidental?'A fresh same-skill verification is next.':'The identified gap will be trained.',phase:output.phase,createdAt:now+1}];
      if(output.nextQuestion)thread.push({id:`active-${output.nextQuestion.questionId||messageId()}`,role:'tutor',kind:'question',question:output.nextQuestion,active:true,activity:'guided',activityId:output.nextQuestion.questionId,phase:output.phase,createdAt:now+2});
      setState({...next,currentQuestion:output.nextQuestion||(action==='finish-diagnosis'?undefined:next.currentQuestion),messages:thread});
      setChoice('');setReasoning('');
    }catch(e:any){setError(e?.message||'The learning state could not be updated.');}finally{finishRequest();}
  }
  async function answerRetrieval(){
    if(!state.controllerToken||!active?.questionId||!choice)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action:'answer-retrieval',courseId,sessionId,controllerToken:state.controllerToken,questionId:active.questionId,choice,reasoning});
      const verdict=output.answerCorrect===true?true:output.answerCorrect===false?false:null,now=Date.now();
      const thread=messages.map(message=>message.active&&message.question?.questionId===active.questionId?{...message,active:false,choice}:message);
      thread.push({id:messageId(),role:'student',kind:'answer',choice,reasoning,text:choice==='F'?"I don't know yet":active.options['ABCDE'.indexOf(choice)]||choice,createdAt:now});
      thread.push({id:messageId(),role:'tutor',kind:'explanation',verdict,blocks:[{type:'paragraph',text:output.feedback||''}],phase:6,createdAt:now+1});
      if(output.nextQuestion)thread.push({id:`active-${output.nextQuestion.questionId||messageId()}`,role:'tutor',kind:'question',question:output.nextQuestion,active:true,activity:'retrieval',activityId:output.nextQuestion.questionId,phase:6,createdAt:now+2});
      setState({...applyActionState(state,output),messages:thread,currentQuestion:output.nextQuestion,mode:'repetition',stage:'repetition',retrievalStarted:true});
      setChoice('');setReasoning('');
    }catch(e:any){setError(e?.message||'REPITITION could not continue.');}finally{finishRequest();}
  }
  async function beginIntegration(){
    if(!state.controllerToken)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action:'integration-plan',courseId,sessionId,controllerToken:state.controllerToken});
      const now=Date.now(),q=output.nextQuestion as Question|undefined;
      const thread=[...closeAction(messages,'integration'),{id:messageId(),role:'student' as const,kind:'clarification' as const,text:'Begin integration.',createdAt:now},{id:messageId(),role:'system' as const,kind:'phase' as const,text:'Topic training is complete. We will now reconstruct the original problem one step at a time.',phase:4,createdAt:now+1}];
      if(q)thread.push({id:`active-${messageId()}`,role:'tutor',kind:'question',question:q,active:true,activity:'integration',activityId:q.questionId,phase:4,createdAt:now+2});
      setState({...state,...applyActionState(state,output),currentQuestion:q,stage:'integration',phase:'Step 4',messages:thread});
      onPhase(4);setChoice('');setReasoning('');
    }catch(e:any){setError(e?.message||'Integration could not start.');}finally{finishRequest();}
  }
  async function answerIntegration(){
    const step=state.integrationPlan?.find(item=>item.id===active?.questionId||item.question.questionId===active?.questionId);
    if(!state.controllerToken||!active||!step||!choice)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action:'integration-answer',courseId,sessionId,controllerToken:state.controllerToken,stepId:step.id,choice,reasoning});
      const now=Date.now(),thread=messages.map(message=>message.active&&message.activityId===step.id?{...message,active:false,choice}:message);
      thread.push({id:messageId(),role:'student',kind:'answer',choice,reasoning,text:choice==='F'?"I don't know yet":active.options['ABCDE'.indexOf(choice)]||choice,createdAt:now});
      thread.push({id:messageId(),role:'tutor',kind:'explanation',verdict:output.answerCorrect===true?true:output.answerCorrect===false?false:null,blocks:[{type:'paragraph',text:output.feedback||''}],phase:4,createdAt:now+1});
      if(output.nextQuestion)thread.push({id:`active-${messageId()}`,role:'tutor',kind:'question',question:output.nextQuestion,active:true,activity:'integration',activityId:output.nextQuestion.questionId,phase:4,createdAt:now+2});
      setState({...state,...applyActionState(state,output),currentQuestion:output.nextQuestion,messages:thread,stage:'integration',phase:'Step 4'});
      setChoice('');setReasoning('');onPhase(4);
    }catch(e:any){setError(e?.message||'The integration answer could not be evaluated.');}finally{finishRequest();}
  }
  async function unlockSolution(){
    if(!state.controllerToken)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action:'unlock-solution',courseId,sessionId,controllerToken:state.controllerToken});
      const solution=output.solution,now=Date.now();
      if(!output.solutionUnlocked||!solution?.steps?.length)throw new Error('The backend did not verify a complete solution.');
      const blocks:ContentBlock[]=solution.steps.flatMap((step:{math:string;explanation:string})=>[{type:'derivation' as const,text:step.math},{type:'paragraph' as const,text:step.explanation}]);
      if(solution.commonMistakes?.length)blocks.push({type:'paragraph',text:`Common points to check: ${solution.commonMistakes.join('; ')}`});
      if(solution.interpretations?.length)blocks.push({type:'paragraph',text:solution.interpretations.join('\n')});
      const thread=[...closeAction(messages,'unlock'),{id:messageId(),role:'student' as const,kind:'clarification' as const,text:'Show the verified solution.',createdAt:now},{id:messageId(),role:'system' as const,kind:'phase' as const,text:'The integration has been verified. The complete solution follows.',phase:5,createdAt:now+1},{id:messageId(),role:'tutor' as const,kind:'explanation' as const,blocks,phase:5,createdAt:now+2}];
      setState({...state,...applyActionState(state,output),solutionUnlocked:true,verifiedSolution:solution,currentQuestion:undefined,stage:'solution',phase:'Step 5',messages:thread});onPhase(5);
    }catch(e:any){setError(e?.message||'The solution could not be verified.');}finally{finishRequest();}
  }
  async function generateTransfer(distance:'near'|'mid'|'wider'){
    if(!state.controllerToken)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action:'generate-transfer',distance,courseId,sessionId,controllerToken:state.controllerToken});
      const prompt=output.transfer?.prompt;if(typeof prompt!=='string'||!prompt.trim())throw new Error('No validated transfer exercise was returned.');
      const actionKey=`transfer-${distance}` as ConversationMessage['actionKey'];
      const now=Date.now(),thread=[...closeAction(messages,actionKey),{id:messageId(),role:'student' as const,kind:'clarification' as const,text:`Generate ${distance}-transfer exercise.`,createdAt:now},{id:messageId(),role:'tutor' as const,kind:'transfer' as const,text:prompt,distance,active:true,activity:'transfer' as const,activityId:distance,phase:6,createdAt:now+1}];
      setState({...state,...applyActionState(state,output),transferExercises:{...state.transferExercises,[distance]:prompt},transferDrafts:{...state.transferDrafts,[distance]:state.transferDrafts?.[distance]||''},messages:thread,stage:'transfer',phase:'Step 6'});onPhase(6);
    }catch(e:any){setError(e?.message||'A transfer exercise could not be generated.');}finally{finishRequest();}
  }
  async function submitTransfer(message:ConversationMessage){
    const distance=message.distance,work=state.transferDrafts?.[distance||''];
    if(!distance||!work?.trim()||!state.controllerToken)return;
    if(!startRequest())return;setError('');
    try{
      const output=await learningAction({action:'evaluate-transfer',distance,courseId,sessionId,controllerToken:state.controllerToken,work});
      const now=Date.now(),thread=messages.map(item=>item.id===message.id?{...item,active:false}:item);
      thread.push({id:messageId(),role:'student',kind:'answer',text:work,createdAt:now});
      thread.push({id:messageId(),role:'tutor',kind:'explanation',verdict:output.evaluation?.correct===true,blocks:[{type:'paragraph',text:output.evaluation?.feedback||'The response was evaluated.'}],phase:6,createdAt:now+1});
      setState({...state,...applyActionState(state,output),transferDrafts:{...state.transferDrafts,[distance]:work},messages:thread,stage:'transfer',phase:'Step 6'});
    }catch(e:any){setError(e?.message||'The transfer response could not be evaluated.');}finally{finishRequest();}
  }
  async function stopRetrieval(){
    if(!state.controllerToken)return;
    if(!startRequest())return;setError('');
    try{const output=await learningAction({action:'stop-retrieval',courseId,sessionId,controllerToken:state.controllerToken}),now=Date.now();const thread=closeAction(messages,'retrieval-stop').map(message=>message.active&&message.kind==='question'?{...message,active:false}:message);setState({...state,...applyActionState(state,output),mode:'guided',retrievalStarted:false,currentQuestion:undefined,stage:'transfer',messages:[...thread,{id:messageId(),role:'student',kind:'clarification',text:'Stop REPITITION.',createdAt:now},{id:messageId(),role:'system',kind:'phase',text:'REPITITION stopped. The original session history is preserved.',phase:output.phase,createdAt:now+1}]});}
    catch(e:any){setError(e?.message||'REPITITION could not be stopped.');}finally{finishRequest();}
  }
  function activeContent(message:ConversationMessage):React.ReactNode{
    if(message.kind==='question'&&message.active&&message.question){
      const label=message.activity==='integration'?`Reconstruction ${Math.min((state.integrationAccepted||[]).length+1,state.integrationPlan?.length||1)} / ${state.integrationPlan?.length||1}`:message.activity==='retrieval'?`REPITITION ${(state.retrievalCount||0)+1}`:stage==='diagnostic'?`Diagnostic ${Math.min(10,state.diagnosticsCount||0)+1} / 10`:undefined;
      return <ActiveQuestion question={message.question} label={label} choice={choice} reasoning={reasoning} busy={busy} feedbackAllowed={message.activity==='guided'} feedbackPending={Boolean(feedbackNote.trim()||feedbackTags.length)} showDiagram={showDiagram} onChoice={setChoice} onReasoning={setReasoning} onFeedback={()=>setFeedbackOpen(true)} onDiagram={()=>setShowDiagram(value=>!value)} onSubmit={()=>void(message.activity==='integration'?answerIntegration():message.activity==='retrieval'?answerRetrieval():callTutor())}/>;
    }
    if(message.kind==='transfer'&&message.active&&message.distance){
      const distance=message.distance;
      return <><label className="reasoningLabel">Your solution<textarea aria-label={`${distance} transfer response`} rows={4} value={state.transferDrafts?.[distance]||''} onChange={event=>setState(previous=>({...previous,transferDrafts:{...previous.transferDrafts,[distance]:event.target.value}}))}/></label>{state.transferDrafts?.[distance]&&<div className="mathPreview"><MathText text={state.transferDrafts[distance]}/></div>}<button className="button primary" disabled={busy||!state.transferDrafts?.[distance]?.trim()} onClick={()=>void submitTransfer(message)}>{busy?'Evaluating…':'Submit response'}</button></>;
    }
    if(message.kind!=='action'||!message.active)return null;
    switch(message.actionKey){
      case 'mistake':return <div className="submitBar"><button className="button secondary" disabled={busy} onClick={()=>void controllerAction('mistake-decision',{accidental:false})}>Train the gap</button><button className="button primary" disabled={busy} onClick={()=>void controllerAction('mistake-decision',{accidental:true})}>Verify with a new question</button></div>;
      case 'diagnostic':return <div className="submitBar"><button className="button secondary" disabled={busy} onClick={()=>void controllerAction('continue-diagnosis')}>Continue diagnosis</button><button className="button primary" disabled={busy} onClick={()=>void controllerAction('finish-diagnosis')}>Begin topic training</button></div>;
      case 'integration':return <button className="button primary" disabled={busy} onClick={()=>void beginIntegration()}>{busy?'Preparing integration…':'Begin integration'}</button>;
      case 'unlock':return <button className="button primary" disabled={busy} onClick={()=>void unlockSolution()}>{busy?'Verifying solution…':'Show verified solution'}</button>;
      case 'transfer-near':return <button className="textButton" disabled={busy} onClick={()=>void generateTransfer('near')}>Generate near-transfer exercise</button>;
      case 'transfer-mid':return <button className="textButton" disabled={busy} onClick={()=>void generateTransfer('mid')}>Generate mid-transfer exercise</button>;
      case 'transfer-wider':return <button className="textButton" disabled={busy} onClick={()=>void generateTransfer('wider')}>Generate wider-transfer exercise</button>;
      case 'retrieval-start':return <button className="textButton" disabled={busy||Boolean(active)} onClick={()=>void beginRetrieval()}>{busy?'Preparing retrieval…':'Start REPITITION'}</button>;
      case 'retrieval-stop':return <button className="textButton" disabled={busy} onClick={()=>void stopRetrieval()}>Stop REPITITION</button>;
      default:return null;
    }
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
  const started=Boolean(state.theorem||messages.some(message=>message.kind==='problem'));

  return <div className="app tutorEmbed">
    <main className="main">
      <div className={`content ${started ? 'chatContent' : 'startContent'}`}>
        {!started && <section className="welcomeChat">
          <div className="composer startComposer" onPaste={handlePaste} onDragOver={event => event.preventDefault()} onDrop={handleDrop}>
            <label className="problemInputLabel" htmlFor="problem-input">Problem (text or LaTeX)</label><textarea id="problem-input" aria-label="Math problem" rows={4} placeholder="Paste a mathematical problem, derivation, or exercise…" value={problemText} onChange={e => { setProblemText(e.target.value); setPendingStart(null); setError(''); }} disabled={busy} />
            {problemText.trim() && <div className="transcriptionPreview" aria-label="Problem preview"><span className="bubbleLabel">{reviewProblem ? 'Recognized problem · check before starting' : 'Preview'}</span><MathText text={problemText} /></div>}
            {image && <div className="imageAttachment"><img src={image.preview} alt="Selected problem" /><span>{image.name}</span><button aria-label="Remove image" onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); setState(prev => ({ ...prev, problemImage: undefined })); }}><X size={16} /></button></div>}
            <div className="composerActions"><label className="attachButton"><Paperclip size={19} /><span>Upload image</span><input disabled={busy || preparingImage} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void attachImage(e.target.files?.[0])} /></label><button className="sendButton" onClick={() => reviewProblem && pendingStart ? acceptTutorOutput(pendingStart, true, problemText, null, null, false) : reviewProblem ? void callTutor({ start: true, textOnly: true }) : beginLesson()} disabled={busy || preparingImage || (!problemText.trim() && !image)} aria-label="Begin with this problem">{busy || preparingImage ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={21} />}</button></div>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
        </section>}

        {started && <>
          <section className="chatThread" aria-label="Tutoring conversation">
            {messages.map(message=><ThreadMessage key={message.id} message={message} activeContent={activeContent(message)}/>)}
            {busy&&<div className="tutorPending" role="status" aria-live="polite"><LoaderCircle size={14} className="spin"/> Tutor is working…</div>}
            {error && <div className="error" role="alert">{error}</div>}
            <div ref={currentTurnRef}/>
          </section>
          {!atLatest&&<button className="latestButton" onClick={()=>currentTurnRef.current?.scrollIntoView({behavior:'smooth',block:'end'})}>Return to latest ↓</button>}

        </>}
      </div>
    </main>
    {feedbackOpen && <div className="dialogBackdrop" onClick={() => setFeedbackOpen(false)}><section className="studentDialog" role="dialog" aria-modal="true" aria-label="Optional feedback" onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setFeedbackOpen(false); if (event.key === 'Tab') { const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, textarea')); const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><button className="dialogClose" aria-label="Close popup" onClick={() => setFeedbackOpen(false)}><X size={20} /></button><h2>Optional feedback</h2><div className="feedbackChips">{['A simpler explanation', 'An example', 'A useful diagram', 'A hint', 'More challenge', 'I’m ready to move on'].map(tag => <button key={tag} aria-pressed={feedbackTags.includes(tag)} className={feedbackTags.includes(tag) ? 'selected' : ''} onClick={() => setFeedbackTags(prev => prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag])}>{tag}</button>)}</div><textarea aria-label="Feedback note" value={feedbackNote} maxLength={2000} onChange={event => setFeedbackNote(event.target.value)} placeholder="Anything else? (optional)" /><button className="button primary" autoFocus onClick={() => setFeedbackOpen(false)}>Done</button></section></div>}
  </div>;
}
