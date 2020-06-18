import { Workspace } from '../workspace';
import { ScopeExtension } from '../scope';
import { ComponentFactory } from '../component';
import { GraphBuilder } from './graph-builder';

export type GraphDeps = [Workspace, ScopeExtension, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
