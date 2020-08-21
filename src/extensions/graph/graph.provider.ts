import { Workspace } from '../workspace';
import { ComponentFactory } from '../component';
import { GraphBuilder } from './graph-builder';
import { ScopeMain } from '../scope';

export type GraphDeps = [Workspace, ScopeMain, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
