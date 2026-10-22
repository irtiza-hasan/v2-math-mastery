import type { LearnerState } from './Tutor';
const API_URL=(import.meta.env.VITE_API_URL||'https://proofwise-api.irtiza-proofwise.workers.dev').replace(/\/$/,'');
export type LearningAction={action:'integration-plan'|'integration-step'|'unlock-solution'|'generate-transfer'|'evaluate-transfer'|'start-retrieval';courseId:string;sessionId:string;controllerToken:string;stepId?:string;work?:string;distance?:'near'|'mid'|'wider'};
export async function learningAction(input:LearningAction){
  const response=await fetch(`${API_URL}/learning`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  let result:any;try{result=await response.json();}catch{throw new Error(`The learning service returned an unreadable response (${response.status}).`);}
  if(!response.ok)throw new Error(result.error||`Learning action failed (${response.status}).`);
  return result as Record<string,any>&{controllerToken:string;phase:number;stage:string;solutionUnlocked:boolean};
}
export function applyActionState(state:LearnerState,result:Record<string,any>):LearnerState{
  return {...state,controllerToken:result.controllerToken,readiness:result.readiness||state.readiness,remediation:result.remediation||state.remediation,integrationPlan:result.integrationPlan||state.integrationPlan,integrationAccepted:result.integrationAccepted||state.integrationAccepted,integrationWork:result.integrationWork||state.integrationWork,verifiedSolution:result.solution||state.verifiedSolution,transferExercises:result.transfer?{...(state.transferExercises||{}),[result.transfer.distance]:result.transfer.prompt}:state.transferExercises,transferFeedback:result.evaluation?.feedback?{...(state.transferFeedback||{}),[result.evaluation.distance||'near']:result.evaluation.feedback}:state.transferFeedback,stage:result.stage==='integration'?'integration':result.stage==='solution'?'solution':result.stage==='transfer'?'transfer':result.stage==='repetition'?'repetition':state.stage,phase:result.phase===2?'Step 1':result.phase===3?'Step 2':result.phase===4?'Step 3':state.phase,solutionUnlocked:result.solutionUnlocked||state.solutionUnlocked};
}
