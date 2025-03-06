import { LATEST_BIT_VERSION, VERSION_DELIMITER } from '@teambit/legacy.constants';
import { loadScope, Scope } from '@teambit/legacy.scope';
import { Version } from '@teambit/objects';

export async function catComponent(id: string): Promise<Record<string, any>> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const scope: Scope = await loadScope();
  const bitId = await scope.getParsedId(id);
  // $FlowFixMe unclear what's the issue here
  const component = await scope.getModelComponent(bitId);
  if (bitId.hasVersion()) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const version: Version = await component.loadVersion(bitId.version, scope.objects);
    return version.toObject();
  }
  if (bitId.version === LATEST_BIT_VERSION && id.includes(VERSION_DELIMITER)) {
    const version = await component.loadVersion(component.getHeadRegardlessOfLaneAsTagOrHash(), scope.objects);
    return version.toObject();
  }
  return component.toObject();
}
