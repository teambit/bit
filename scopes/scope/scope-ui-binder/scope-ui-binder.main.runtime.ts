import { MainRuntime } from '@teambit/cli';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql/dist/graphql.aspect.js';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope/dist/scope.aspect.js';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui/dist/ui.aspect.js';
import { ScopeUIRoot } from '@teambit/scope/dist/scope.ui-root';
import { scopeSchema } from '@teambit/scope/dist/scope.graphql';
import { ScopeUiBinderAspect } from './scope-ui-binder.aspect';

export class ScopeUiBinderMain {
  static runtime = MainRuntime;
  static dependencies = [ScopeAspect, UIAspect, GraphqlAspect];
  static slots = [];
  static async provider([scope, ui, graphql]: [ScopeMain, UiMain, GraphqlMain]) {
    if (!scope) return undefined;
    ui.registerUiRoot(new ScopeUIRoot(scope));
    graphql.register(() => scopeSchema(scope));
    return undefined;
  }
}

ScopeUiBinderAspect.addRuntime(ScopeUiBinderMain);

export default ScopeUiBinderMain;
