import { Component } from '../component';
import { ComponentCapsule } from '../../capsule-ext';
import { ResolvedComponent } from '../workspace/resolved-component';

export class TaskContext {
  constructor(readonly component: ResolvedComponent) {}
}
