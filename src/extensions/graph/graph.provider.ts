import { Workspace } from '../workspace';
import { Scope } from '../scope';
import { ComponentFactory } from '../component';
import { GraphBuilder } from './graph-builder';

export type GraphDeps = [Workspace, Scope, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
