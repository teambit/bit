import { BitId } from '../../../bit-id';
import { LATEST_BIT_VERSION, VERSION_DELIMITER } from '../../../constants';
import { loadScope, Scope } from '../../../scope';
import Version from '../../../scope/models/version';

export default (async function catComponent(id: string) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const scope: Scope = await loadScope();
  const bitId: BitId = await scope.getParsedId(id);
  // $FlowFixMe unclear what's the issue here
  const component = await scope.getModelComponent(bitId);
  if (bitId.hasVersion()) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const version: Version = await component.loadVersion(bitId.version, scope.objects);
    return version.toObject();
  }
  if (bitId.version === LATEST_BIT_VERSION && id.includes(VERSION_DELIMITER)) {
    const version = await component.loadVersion(component.latest(), scope.objects);
    return version.toObject();
  }
  return component.toObject();
});
