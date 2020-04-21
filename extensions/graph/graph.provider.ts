import { Workspace } from '@bit/bit.core.workspace';
import { Scope } from '@bit/bit.core.scope';
import { ComponentFactory } from '@bit/bit.core.component';
import { GraphBuilder } from './graph-builder';

export type GraphDeps = [Workspace, Scope, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
