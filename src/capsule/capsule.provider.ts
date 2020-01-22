import Capsule from './capsule';
import capsuleOrchestrator from './orchestrator/orchestrator';

export type CapsuleConfig = {};

// export async function provideCapsuleOrchestrator(config: CapsuleConfig) {
export async function provideCapsuleOrchestrator() {
  await capsuleOrchestrator.buildPools();
  return new Capsule(capsuleOrchestrator);
}
