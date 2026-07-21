import { AspectLoaderAspect } from './aspect-loader.aspect';

export type {
  AspectLoaderMain,
  AspectDescriptor,
  MainAspect,
  OnLoadRequireableExtension,
  AspectResolver,
  ResolvedAspect,
} from './aspect-loader.main.runtime';
export {
  getAspectDef,
  getAspectDir,
  getAspectDistDir,
  getCoreAspectPackageName,
  getCoreAspectName,
  getAspectDirFromBvm,
} from './core-aspects';
export type { PluginDefinition } from './plugin-definition';
export { AspectDefinition } from './aspect-definition';
export { UNABLE_TO_LOAD_EXTENSION } from './constants';
export { AspectLoaderAspect };
export default AspectLoaderAspect;
