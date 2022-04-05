import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { isBinaryFile } from 'isbinaryfile';
import { compact } from 'lodash';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import PkgAspect, { PkgMain } from '@teambit/pkg';
import { RefactoringAspect } from './refactoring.aspect';
import { DependencyNameRefactorCmd, RefactorCmd } from './refactor.cmd';

export class RefactoringMain {
  constructor(private componentMain: ComponentMain, private pkg: PkgMain) {}

  async refactorDependencyName(components: Component[], oldId: ComponentID, newId: ComponentID): Promise<Component[]> {
    const host = this.componentMain.getHost();
    const oldComponent = await host.get(oldId);
    if (!oldComponent) throw new Error(`unable to find the old-component: "${oldId.toString()}"`);
    const newComponent = await host.get(newId);
    if (!newComponent) throw new Error(`unable to find the new-component: "${newId.toString()}"`);
    const oldPackageName = this.pkg.getPackageName(oldComponent);
    const newPackageName = this.pkg.getPackageName(newComponent);
    if (oldPackageName === newPackageName) {
      throw new BitError(`refactoring: the old package-name and the new package-name are the same: ${oldPackageName}`);
    }
    const results = await Promise.all(
      components.map(async (comp) => {
        const hasChanged = await this.replaceString(comp, oldPackageName, newPackageName);
        return hasChanged ? comp : null;
      })
    );
    return compact(results);
  }

  private async replaceString(comp: Component, oldString: string, newString: string): Promise<boolean> {
    const changed = await Promise.all(
      comp.filesystem.files.map(async (file) => {
        const isBinary = await isBinaryFile(file.contents);
        if (isBinary) return false;
        const strContent = file.contents.toString();
        if (strContent.includes(oldString)) {
          const oldStringRegex = new RegExp(oldString, 'g');
          const newContent = strContent.replace(oldStringRegex, newString);
          file.contents = Buffer.from(newContent);
          return true;
        }
        return false;
      })
    );
    return changed.some((c) => c);
  }

  static slots = [];
  static dependencies = [ComponentAspect, PkgAspect, CLIAspect];
  static runtime = MainRuntime;
  static async provider([componentMain, pkg, cli]: [ComponentMain, PkgMain, CLIMain]) {
    const refactoringMain = new RefactoringMain(componentMain, pkg);
    const subCommands = [new DependencyNameRefactorCmd(refactoringMain, componentMain)];
    const refactorCmd = new RefactorCmd();
    refactorCmd.commands = subCommands;
    cli.register(refactorCmd);
    return refactoringMain;
  }
}

RefactoringAspect.addRuntime(RefactoringMain);
