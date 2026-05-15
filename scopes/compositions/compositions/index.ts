import { CompositionsAspect } from './compositions.aspect';

export { CompositionsAspect };
export type { CompositionsMain } from './compositions.main.runtime';
export type {
  CompositionsUI,
  CompositionsMenuSlot,
  EmptyStateSlot,
  UsePreviewSandboxSlot,
} from './compositions.ui.runtime';
export type { CompositionProps } from './composition';
export type { CompositionContentProps } from './compositions';
// UI value exports removed from this barrel — main-runtime imports of
// `@teambit/compositions` must not drag in UI-side dependencies (which
// transitively pull `@teambit/documenter.ui.*`, `react`, etc.). UI callers
// import these directly:
//   - Composition (was: './composition')
//   - CompositionContent (was: './compositions')
//   - ComponentComposition, LiveControls, LiveControlsDiffPanel, LiveControlsRenderer (was: './ui')
//   - useDefaultControlsSchemaResponder (was: './use-default-controls-schema-responder')
export type { CompositionsPreview } from './compositions.preview.runtime';
export default CompositionsAspect;
