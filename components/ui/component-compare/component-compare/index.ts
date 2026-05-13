export { ComponentCompare } from './component-compare';
export type { APIDiffResult, APIDiffChange, APIDiffDetail } from './component-compare';
export { DiffModeProvider, useDiffMode } from './diff-mode-context';
export type { DiffDisplayMode } from './diff-mode-context';
export {
  FileRegistryProvider,
  useFileRegistry,
  useFileRegistryRegister,
  useAspectRegistryRegister,
  useCompositionsRegistryRegister,
} from './file-registry';
export type { FileInfo } from './file-registry';
