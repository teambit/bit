import { ComponentCapsule } from '../../../extensions/capsule-ext';
import orchestrator from '../../../extensions/network/orchestrator/orchestrator';

export default (async function sshIntoCapsule(bitId: string): Promise<any> {
  if (!orchestrator) throw new Error(`can't connect to capsule in non consumer environment`);
  const resource = await orchestrator.acquire(bitId);
  if (!resource) throw new Error(`capsule ${bitId} not found`);
  const capsule = resource.use() as ComponentCapsule;
  return capsule.terminal();
});
