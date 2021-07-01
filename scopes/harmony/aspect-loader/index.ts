import { AspectLoaderAspect } from './aspect-loader.aspect';

export type {
  AspectLoaderMain,
  AspectDescriptor,
  MainAspect,
  OnLoadRequireableExtension,
} from './aspect-loader.main.runtime';
export {
  getAspectDef,
  getAspectDir,
  getAspectDistDir,
  getCoreAspectPackageName,
  getCoreAspectName,
} from './core-aspects';
export { AspectDefinition } from './aspect-definition';
export { AspectLoaderAspect };
export default AspectLoaderAspect;
