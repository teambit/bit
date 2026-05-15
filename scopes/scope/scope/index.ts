import { ScopeAspect } from './scope.aspect';

export { ComponentNotFound, NoIdMatchPattern } from './exceptions';
// UI value exports removed from this barrel:
//   - ScopeComponentCard (was: './ui/scope-overview/scope-overview')
//   - ScopeContext (was: '@teambit/scope.ui.hooks.scope-context')
// UI callers should import from those paths directly.
export type { ScopeMain } from './scope.main.runtime';
export type { ScopeModel } from '@teambit/scope.models.scope-model';
export type { StagedConfig } from './staged-config';
export type { ScopeUI, ScopeBadgeSlot, ScopeOverview, ScopeOverviewSlot, OverviewLineSlot } from './scope.ui.runtime';
export { ScopeAspect };
export default ScopeAspect;
