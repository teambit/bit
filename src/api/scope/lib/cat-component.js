/** @flow */
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import Version from '../../../scope/models/version';

export default (async function catComponent(id: string) {
  const scope = await loadScope();
  const bitId = BitId.parse(id);
  const component = await scope.sources.get(bitId);
  if (!component) return Promise.reject('component was not found');
  if (bitId.hasVersion()) {
    const version: Version = await component.loadVersion(bitId.version, scope.objects);
    return version.toObject();
  }
  return component.toObject();
});
