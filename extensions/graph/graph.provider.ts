import { Workspace } from '@teambit/workspace';
import { ScopeExtension } from '@teambit/scope';
import { ComponentFactory } from '@teambit/component';
import { GraphBuilder } from './graph-builder';

export type GraphDeps = [Workspace, ScopeExtension, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
