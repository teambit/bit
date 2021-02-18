import { MainRuntime } from '@teambit/cli';
import { E2eWorkspaceAspect } from './e2e-workspace.aspect';

export class E2eWorkspaceMain {
  static runtime = MainRuntime;

  static dependencies = [];

  static async provider() {
    const e2eWorkspaceMain = new E2eWorkspaceMain();
    return e2eWorkspaceMain;
  }
}

E2eWorkspaceAspect.addRuntime(E2eWorkspaceMain);
