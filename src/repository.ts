import type { LearningStore } from './models.ts';
import { newSession, uid, recordLearner } from './models.ts';
const KEY = 'llm-ta-courses-v1';
const empty = (): LearningStore => ({ version: 1, revision: 0, courses: [], sessions: [], skills: [], evidence: [] });
export interface LearningRepository { load(): LearningStore; save(value: LearningStore): void; }
export class BrowserLearningRepository implements LearningRepository {
  load(): LearningStore {
    const raw = localStorage.getItem(KEY);
    if (raw) { const data = JSON.parse(raw); if (!validStore(data)) throw new Error('Saved data could not be read. It has been preserved; export your browser data before resetting.'); return data; }
    // Copy the previous single-problem profile once. Never delete its original record.
    const profile = localStorage.getItem('math-mastery-anonymous-profile');
    const legacy = profile && localStorage.getItem(`math-mastery-progress-${profile}`);
    if (legacy) {
      const learner = JSON.parse(legacy);
      if (learner.theorem || learner.currentQuestion) { const course = { id: uid(), name: 'Imported learning', description: 'Your previous saved problem. Rename this course to match its subject.', createdAt: Date.now() }; const session = newSession(course.id); session.learner = learner; session.title = learner.theorem?.slice(0,70) || 'Imported problem'; return recordLearner({ ...empty(), courses: [course], sessions: [session] }, session.id, learner); }
    }
    return empty();
  }
  save(value: LearningStore) {
    const current = localStorage.getItem(KEY);
    if (current && JSON.parse(current).revision > value.revision) throw new Error('Another tab saved newer changes. Export this tab’s work, then reload before continuing.');
    localStorage.setItem(KEY, JSON.stringify(value));
  }
}
export function validStore(data: unknown): data is LearningStore {
  const d = data as LearningStore;
  return !!d && d.version === 1 && Number.isFinite(d.revision) && Array.isArray(d.courses) && Array.isArray(d.sessions) && Array.isArray(d.skills) && Array.isArray(d.evidence)
    && d.courses.every(c => typeof c.id === 'string' && typeof c.name === 'string')
    && d.sessions.every(s => typeof s.id === 'string' && d.courses.some(c => c.id === s.courseId) && typeof s.title === 'string' && !!s.learner && !!s.skillLinks && !!s.transfer && Array.isArray(s.attachments) && Number.isInteger(s.phase) && s.phase >= 0 && s.phase <= 6)
    && d.skills.every(s => typeof s.id === 'string' && typeof s.name === 'string' && d.courses.some(c => c.id === s.courseId))
    && d.evidence.every(e => typeof e.id === 'string' && d.skills.some(s => s.id === e.skillId) && d.sessions.some(s => s.id === e.sessionId));
}
export const repository = new BrowserLearningRepository();
export async function readAttachment(file: File) {
  if (file.size > 1_500_000) throw new Error('Use a file under 1.5 MB for browser storage.');
  return new Promise<{ name: string; type: string; dataUrl: string }>((resolve,reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('This file could not be read.')); reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: String(reader.result) }); reader.readAsDataURL(file); });
}
