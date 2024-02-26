import { SymphonyTemplates } from '@bitdev/symphony.generators.symphony-templates';
import { EnvContext } from '@teambit/envs';
import { ComponentTemplate } from '@teambit/generator';
import { aspectTemplate } from './templates/aspect';

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = SymphonyTemplates({ symphonyEnvId: 'bitdev.symphony/envs/symphony-env' })(envContext);
  const newTemplates = templateList.compute();
  return [...newTemplates, aspectTemplate];
}
