import { SnappingAspect } from './snapping.aspect';

export type { BitCloudUser } from './tag-model-component';
export type {
  SnappingMain,
  TagResults,
  SnapResults,
  SnapFromScopeResults,
  SnapDataParsed,
} from './snapping.main.runtime';
export default SnappingAspect;
export { SnappingAspect };
export { tagModelComponent, onTagIdTransformer, BasicTagParams } from './tag-model-component';
export { AUTO_TAGGED_MSG, NOTHING_TO_TAG_MSG } from './tag-cmd';
export {
  snapFromScopeOptions,
  inputDataDescription,
  SnapDataPerCompRaw,
  SnapFromScopeOptions,
} from './snap-from-scope.cmd';
