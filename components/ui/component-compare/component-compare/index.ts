export { ComponentCompare } from './component-compare';
export type { APIDiffResult, APIDiffChange, APIDiffDetail } from './component-compare';
export { DiffModeProvider, useDiffMode } from './diff-mode-context';
export type { DiffDisplayMode } from './diff-mode-context';
export {
  FileRegistryProvider,
  useFileRegistry,
  useFileRegistryRegister,
  useAspectRegistryRegister,
  useApiEntriesRegister,
  useCompositionsRegistryRegister,
} from './file-registry';
export type { FileInfo } from './file-registry';
export { CompareToolbar } from './compare-toolbar';
export type { CompareToolbarProps, CompareViewMode, CompareGroupByOption, DiffMode } from './compare-toolbar';
export { CompareSidebar } from './compare-sidebar';
export type { CompareSidebarProps, CompareSidebarItem, CompareSidebarGroup } from './compare-sidebar';
export { InlineComponentCompare, ComponentCompareHeader } from './component-compare';
export type { InlineComponentCompareProps, ComponentCompareHeaderProps } from './component-compare';
export { CompareDataProvider, useCompareData, COMPARE_PAGE_SIZE } from './compare-data-context';
export type { CompareDataContextModel, CompareComponentData, ComponentComparePair } from './compare-data-context';
export { RegistryFeeder } from './component-compare';
