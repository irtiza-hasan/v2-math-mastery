import type { LearnerState } from './Tutor';
export type SkillStatus = 'Not assessed' | 'Developing' | 'Strong evidence' | 'Needs review';
export type Attachment = { name: string; type: string; dataUrl: string };
export type Course = { id: string; name: string; description: string; createdAt: number; syllabus?: Attachment };
export type CourseSkill = { id: string; courseId: string; name: string; description: string };
export type SkillEvidence = { id: string; skillId: string; sessionId: string; time: number; question: string; response: string; reasoning: string; feedback: string; correct: boolean | null; reasoningSound?: boolean | null; stage?: string };
export type SkillState = { status: SkillStatus; summary: string; observations: number; lastObserved?: number };
export type LearningSession = { id: string; courseId: string; title: string; createdAt: number; updatedAt: number; archived: boolean; phase: number; learner: LearnerState; skillLinks: Record<string, string>; notes: string; scratchpad: string; solutionNotes: string; transfer: { near: string; mid: string; wider: string }; attachments: Attachment[] };
export type LearningStore = { version: 1; revision: number; courses: Course[]; sessions: LearningSession[]; skills: CourseSkill[]; evidence: SkillEvidence[] };
export function sessionDisplayTitle(session: LearningSession): string {
  const source = session.learner.theorem || session.learner.draftProblem || '';
  return source && session.title === source.slice(0,70) ? source : session.title;
}
export const phases = ['Problem orientation', 'Prerequisite mapping', 'Adaptive diagnostics', 'Topic training', 'Gradual integration', 'Solution & understanding', 'Transfer & review'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export function newSession(courseId: string): LearningSession { return { id: uid(), courseId, title: 'Untitled mathematical problem', createdAt: Date.now(), updatedAt: Date.now(), archived: false, phase: 0, learner: {}, skillLinks: {}, notes: '', scratchpad: '', solutionNotes: '', transfer: { near: '', mid: '', wider: '' }, attachments: [] }; }
export function skillState(evidence: SkillEvidence[], now = Date.now()): SkillState {
  const observed = evidence.filter(e => e.correct !== null).sort((a,b) => a.time - b.time);
  if (!observed.length) return { status: 'Not assessed', summary: 'No assessed responses yet. This is uncertainty, not a failed skill.', observations: 0 };
  const last = observed.at(-1)!;
  const recent = observed.slice(-5);
  const consistent = recent.length === 5 && recent.every(e => e.correct === true && e.reasoningSound !== false);
  const contexts = new Set(recent.map(e => e.sessionId)).size;
  const stale = now - last.time > 21 * 86400000;
  const status: SkillStatus = stale ? 'Needs review' : consistent && contexts >= 2 ? 'Strong evidence' : 'Developing';
  return { status, observations: observed.length, lastObserved: last.time, summary: stale ? 'No recent observation in 21 days. Review is suggested; forgetting has not been measured.' : status === 'Strong evidence' ? 'Five consecutive sound responses across at least two sessions. A new problem still requires diagnosis.' : `${observed.length} observed response${observed.length === 1 ? '' : 's'}. More varied practice is needed before drawing a strong conclusion.` };
}
export function recordLearner(store: LearningStore, sessionId: string, learner: LearnerState): LearningStore {
  const session = store.sessions.find(s => s.id === sessionId);
  if (!session) return store;
  const skills = [...store.skills], evidence = [...store.evidence], skillLinks = { ...session.skillLinks };
  const concepts = [...(learner.modules || []).map(m => ({ key: m.id, name: m.title, description: m.purpose })), ...(learner.history || []).filter(h => !h.question.moduleId).map(h => ({ key: h.question.skill || 'Problem reasoning', name: h.question.skill || 'Problem reasoning', description: 'Observed in this course’s learning sessions.' }))];
  for (const m of concepts) {
    let skill = skills.find(s => s.courseId === session.courseId && s.name.trim().toLocaleLowerCase() === m.name.trim().toLocaleLowerCase());
    if (!skill) { skill = { id: uid(), courseId: session.courseId, name: m.name, description: m.description }; skills.push(skill); }
    skillLinks[m.key] = skill.id;
  }
  (learner.history || []).forEach((h, i) => {
    const key = `${sessionId}:${h.time}:${i}`;
    const skillId = skillLinks[h.question.moduleId || h.question.skill || 'Problem reasoning'];
    if (skillId && !evidence.some(e => e.id === key)) evidence.push({ id: key, sessionId, skillId, time: h.time, question: h.question.prompt, response: h.choice, reasoning: h.reasoning, feedback: h.feedback, correct: h.choice === 'F' ? null : h.isCorrect, reasoningSound: h.reasoningSound, stage: h.stage });
  });
  const stagePhase = learner.stage === 'diagnostic' || learner.stage === 'verification' ? 2 : learner.stage === 'learning' ? 3 : learner.stage === 'integration' || learner.stage === 'proof' ? 4 : learner.stage === 'solution' ? 5 : learner.stage === 'transfer' || learner.stage === 'repetition' ? 6 : session.phase;
  return { ...store, skills, evidence, sessions: store.sessions.map(s => s.id !== sessionId ? s : { ...s, learner, skillLinks, updatedAt: Date.now(), phase: learner.currentQuestion && (s.phase <= 4 || (s.learner.mode === 'repetition' && learner.mode !== 'repetition')) ? stagePhase : s.phase, title: (s.title === 'Untitled mathematical problem' || s.title === (s.learner.draftProblem || '') || s.title === (s.learner.theorem || '') || s.title === (s.learner.draftProblem || '').slice(0,70) || s.title === (s.learner.theorem || '').slice(0,70)) && (learner.theorem || learner.draftProblem) ? (learner.theorem || learner.draftProblem) : s.title }) };
}
