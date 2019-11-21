import { loadScope, Scope } from '../../../scope';
import { BitId } from '../../../bit-id';
import Version from '../../../scope/models/version';
import { LATEST_BIT_VERSION, VERSION_DELIMITER } from '../../../constants';
import GeneralError from '../../../error/general-error';

export default (async function catComponent(id: string) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const scope: Scope = await loadScope();
  const bitId: BitId = await scope.getParsedId(id);
  // $FlowFixMe unclear what's the issue here
  const component = await scope.sources.get(bitId);
  if (!component) throw new GeneralError('component was not found');
  if (bitId.hasVersion()) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const version: Version = await component.loadVersion(bitId.version, scope.objects);
    return version.toObject();
  }
  if (bitId.version === LATEST_BIT_VERSION && id.includes(VERSION_DELIMITER)) {
    const version: Version = await component.loadVersion(component.latest(), scope.objects);
    return version.toObject();
  }
  return component.toObject();
});
