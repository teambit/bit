import { ResolvedComponent } from '../workspace/resolved-component';

export class TaskContext {
  constructor(readonly component: ResolvedComponent) {}
}
