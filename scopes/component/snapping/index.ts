import { SnappingAspect } from './snapping.aspect';

export type { BitCloudUser } from './version-maker';
export type {
  SnappingMain,
  TagResults,
  SnapResults,
  SnapFromScopeResults,
  SnapDataParsed,
  SnapDataPerCompRaw,
} from './snapping.main.runtime';
export default SnappingAspect;
export { SnappingAspect };
export { VersionMaker, onTagIdTransformer, BasicTagParams, VersionMakerParams, BasicTagSnapParams } from './version-maker';
export { AUTO_TAGGED_MSG, NOTHING_TO_TAG_MSG, tagCmdOptions, TagParams, validateOptions, tagResultOutput } from './tag-cmd';

