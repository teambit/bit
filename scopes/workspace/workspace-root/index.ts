export { WorkspaceRootAspect, default } from './workspace-root.aspect';
export type { WorkspaceRootMain } from './workspace-root.main.runtime';
export type { WorkspaceRootData } from './workspace-root-data';
export type { CloneOptions, CloneResult } from './clone';
export {
  findWorkspaceRootMap,
  isPnpmWorkspaceRoot,
  isWorkspaceRootComponent,
  readWorkspaceRoot,
  writeWorkspaceRoot,
} from './workspace-root-data';
