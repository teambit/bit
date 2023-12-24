import {
  HarmonyEnvTemplate,
  HarmonyPlatformTemplate,
  PlatformAspectTemplate,
  HarmonyRuntimeTemplate,
  AspectTemplate,
} from '@bitdev/harmony.generators.harmony-templates';
import { EnvContext } from '@teambit/envs';
import { ComponentTemplate, TemplateList } from '@teambit/generator';
import { aspectTemplate } from './templates/aspect';

const templateListHandler = TemplateList.from([
  HarmonyPlatformTemplate.from({ env: 'bitdev.harmony/harmony-env' }),
  PlatformAspectTemplate.from({ env: 'bitdev.harmony/harmony-env' }),
  HarmonyRuntimeTemplate.from({ env: 'bitdev.harmony/harmony-env' }),
  AspectTemplate.from({ env: 'bitdev.harmony/harmony-env' }),
  HarmonyEnvTemplate.from(),
]);

export function getTemplates(envContext: EnvContext): ComponentTemplate[] {
  const templateList = templateListHandler(envContext);
  const newTemplates = templateList.compute();
  return [...newTemplates, aspectTemplate];
}
