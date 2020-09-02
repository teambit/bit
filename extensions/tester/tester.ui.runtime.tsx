import { UIRuntime } from '@teambit/ui';
import type { WorkspaceUI } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';

import { TesterAspect } from './tester.aspect';

export class TesterUI {
  static dependencies = [WorkspaceAspect];

  static runtime = UIRuntime;

  stageKey?: string;

  constructor(private workspace: WorkspaceUI) {}

  static async provider([workspace]: [WorkspaceUI]) {
    const testerUi = new TesterUI(workspace);

    // workspace.registerMenuItem({
    //   label: <TopBarNav to="~tests">Tests</TopBarNav>
    // });

    // workspace.registerPage({
    //   path: '~tests',
    //   children: <TestsPage />
    // });

    return testerUi;
  }
}

export default TesterUI;

TesterAspect.addRuntime(TesterUI);
