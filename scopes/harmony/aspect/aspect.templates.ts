import { SymphonyTemplates } from '@bitdev/symphony.generators.symphony-templates';
import type { EnvContext } from '@teambit/envs';
import type { ComponentTemplate } from '@teambit/generator';

// the "bit-aspect" template used to be registered here. it now lives in its rightful home -
// teambit.harmony/envs/core-aspect-env (the env used by the aspects of the bit repo itself) -
// and the components it creates use that env rather than this one. it is available via the
// generator config ("teambit.generator/generator": { "envs": [...] }) or the --env flag.
export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = SymphonyTemplates({ symphonyEnvId: 'bitdev.symphony/envs/symphony-env' })(envContext);
  return templateList.compute();
}
