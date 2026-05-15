import { MainRuntime } from '@teambit/cli';
import type { BundlerMain } from '@teambit/bundler';
import { BundlerAspect } from '@teambit/bundler/dist/bundler.aspect.js';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install/dist/install.aspect.js';
import type { UiMain } from '@teambit/ui';
import { UIAspect } from '@teambit/ui/dist/ui.aspect.js';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace/dist/workspace.aspect.js';
import { InstallUiBinderAspect } from './install-ui-binder.aspect';

export class InstallUiBinderMain {
  static runtime = MainRuntime;
  static dependencies = [InstallAspect, UIAspect, BundlerAspect, WorkspaceAspect];
  static slots = [];
  static async provider([install, ui, bundler, workspace]: [InstallMain, UiMain, BundlerMain, Workspace]) {
    if (!install) return undefined;
    install.registerPostInstall(async () => {
      if (!ui.getUIServer()) return;
      const components = await workspace.list();
      await bundler.addNewDevServers(components);
    });
    return undefined;
  }
}

InstallUiBinderAspect.addRuntime(InstallUiBinderMain);

export default InstallUiBinderMain;
