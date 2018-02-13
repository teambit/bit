/** @flow */
import { loadScope, Scope } from '../../../scope';
import { BitId } from '../../../bit-id';
import Version from '../../../scope/models/version';
import { LATEST_BIT_VERSION, VERSION_DELIMITER } from '../../../constants';

export default (async function catComponent(id: string) {
  const scope: Scope = await loadScope();
  const bitId = BitId.parse(id);
  const component = await scope.sources.get(bitId);
  if (!component) return Promise.reject('component was not found');
  if (bitId.hasVersion()) {
    const version: Version = await component.loadVersion(bitId.version, scope.objects);
    return version.toObject();
  }
  if (bitId.version === LATEST_BIT_VERSION && id.includes(VERSION_DELIMITER)) {
    const version: Version = await component.loadVersion(component.latest(), scope.objects);
    return version.toObject();
  }
  return component.toObject();
});
