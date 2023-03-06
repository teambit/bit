import { AspectLoaderAspect } from './aspect-loader.aspect';

export type {
  AspectLoaderMain,
  AspectDescriptor,
  MainAspect,
  OnLoadRequireableExtension,
  AspectResolver,
  ResolvedAspect
} from './aspect-loader.main.runtime';
export {
  getAspectDef,
  getAspectDir,
  getAspectDistDir,
  getCoreAspectPackageName,
  getCoreAspectName,
  getAspectDirFromBvm,
} from './core-aspects';
export { PluginDefinition } from './plugin-definition';
export { AspectDefinition } from './aspect-definition';
export { AspectLoaderAspect };
export default AspectLoaderAspect;
