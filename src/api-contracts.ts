/** Future provider-neutral contracts. The deployed Worker currently supports the legacy tutor request only. */
import type { Module } from './learning';
import type { SkillEvidence, SkillState } from './models';
export type DiagnosticPrior = { skillId: string; topic: string; evidence: SkillEvidence[]; interpretation: SkillState };
export type TutorContext = { courseId: string; sessionId: string; originalProblem: string; prerequisites: Module[]; prior: DiagnosticPrior[]; policy: 'prior-informs-start-never-skips-diagnosis' };
export type TutorCommand =
 | { kind: 'analyze'; problem: string; image?: { mimeType: string; data: string } }
 | { kind: 'prerequisites'; context: TutorContext }
 | { kind: 'diagnose' | 'train'; context: TutorContext; response?: { questionId: string; choice?: 'A'|'B'|'C'|'D'|'E'|'F'; reasoning?: string; feedback?: string; mistakeVerification?: boolean } }
 | { kind: 'integrate'; context: TutorContext; work: string; requestedHint?: number }
 | { kind: 'solution'; context: TutorContext; reconstructionEvidenceIds: string[] }
 | { kind: 'transfer'; context: TutorContext; distance: 'near'|'mid'|'wider' };
export type TutorResult = { questionId?: string; prerequisites?: Module[]; feedback?: string; evidence?: SkillEvidence[]; solution?: { unlocked: boolean; steps: { math: string; explanation: string }[] }; transfer?: { prompt: string; distance: 'near'|'mid'|'wider' } };
