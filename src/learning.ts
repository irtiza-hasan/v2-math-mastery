export type Module = { id: string; title: string; purpose: string; dependsOn: string[] };
export type Lesson = { title: string; concept: string; workedExample: string; connection: string };
type Evidence = { question: { moduleId?: string; skill?: string }; isCorrect: boolean | null; reasoningSound?: boolean | null };
export function validModules(value: unknown): value is Module[] {
  if (!Array.isArray(value) || !value.length || value.length > 6) return false;
  const ids = new Set(value.map(m => m?.id));
  if (ids.size !== value.length || !value.every(m => typeof m.id === 'string' && /^[a-z0-9-]{1,60}$/.test(m.id) && typeof m.title === 'string' && m.title.length > 0 && m.title.length <= 100 && typeof m.purpose === 'string' && m.purpose.length <= 500 && Array.isArray(m.dependsOn) && m.dependsOn.every((id: unknown) => typeof id === 'string' && ids.has(id) && id !== m.id))) return false;
  const modules = value;
  const done = new Set<string>(), visiting = new Set<string>();
  function walk(id: string): boolean { if (done.has(id)) return true; if (visiting.has(id)) return false; visiting.add(id); if (!modules.find(m => m.id === id)!.dependsOn.every(walk)) return false; visiting.delete(id); done.add(id); return true; }
  return value.every(m => walk(m.id));
}
export function moduleProgress(module: Module, history: Evidence[]) {
  const evidence = history.filter(h => h.question.moduleId === module.id || (!h.question.moduleId && h.question.skill?.toLowerCase() === module.title.toLowerCase()));
  let streak = 0;
  for (let i = evidence.length - 1; i >= 0 && evidence[i].isCorrect === true && evidence[i].reasoningSound !== false; i--) streak++;
  const ready = streak >= 5;
  const status = ready ? 'ready' : !evidence.length ? 'unassessed' : evidence.at(-1)?.isCorrect !== true || evidence.at(-1)?.reasoningSound === false ? 'repair' : 'developing';
  return { id: module.id, status, ready, streak, label: status === 'ready' ? 'Ready to apply' : status === 'repair' ? 'Focused teaching needed' : status === 'developing' ? 'More practice needed' : 'Not yet assessed', evidence: evidence.length, strength: Math.min(1, streak / 5) };
}
export function nextModule(modules: Module[], history: Evidence[]): Module | undefined {
  const pending = modules.filter(m => !moduleProgress(m, history).ready);
  const eligible = pending.filter(m => m.dependsOn.every(id => moduleProgress(modules.find(x => x.id === id)!, history).ready));
  return (eligible.length ? eligible : pending).sort((a,b) => Number(moduleProgress(b, history).status === 'repair') - Number(moduleProgress(a, history).status === 'repair'))[0];
}
export function validLesson(value: unknown): value is Lesson { const v = value as Lesson; return !!v && ['title','concept','workedExample','connection'].every(key => typeof v[key as keyof Lesson] === 'string' && v[key as keyof Lesson].trim().length >= (key === 'title' ? 2 : 12)); }
