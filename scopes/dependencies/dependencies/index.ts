import { DependenciesAspect } from './dependencies.aspect';

export type { DependenciesMain } from './dependencies.main.runtime';
export default DependenciesAspect;
export { DependenciesAspect };
export { detectImportedPackages } from './files-dependency-builder/detect-imported-packages';
export type { ImportedPackages, ImportsCache, FileContent } from './files-dependency-builder/detect-imported-packages';
