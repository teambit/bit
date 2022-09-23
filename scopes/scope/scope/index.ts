import { ScopeAspect } from './scope.aspect';

export { ComponentNotFound, NoIdMatchPattern } from './exceptions';
export { ScopeComponentCard } from './ui/scope-overview/scope-overview';
export type { ScopeMain } from './scope.main.runtime';
export type { ScopeModel } from '@teambit/scope.models.scope-model';
export { ScopeContext } from '@teambit/scope.ui.hooks.scope-context';
export type { ScopeUI, ScopeBadgeSlot, ScopeOverview, ScopeOverviewSlot, OverviewLineSlot } from './scope.ui.runtime';
export { ScopeAspect };
export default ScopeAspect;
