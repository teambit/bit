import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { isBinaryFile } from 'isbinaryfile';
import { compact } from 'lodash';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import PkgAspect, { PkgMain } from '@teambit/pkg';
import { RefactoringAspect } from './refactoring.aspect';
import { DependencyNameRefactorCmd, RefactorCmd } from './refactor.cmd';

export type MultipleStringsReplacement = Array<{ oldStr: string; newStr: string }>;

export class RefactoringMain {
  constructor(private componentMain: ComponentMain, private pkg: PkgMain) {}

  /**
   * refactor the dependency name of a component.
   * oldId and newId can be either a component-id or a package-name.
   * this method changes the source code of the component, but doesn't write to the filesystem.
   */
  async refactorDependencyName(
    components: Component[],
    oldId: ComponentID | string,
    newId: ComponentID | string
  ): Promise<{ oldPackageName: string; newPackageName: string; changedComponents: Component[] }> {
    const oldPackageName = await this.getPackageNameByUnknownId(oldId);
    const newPackageName = await this.getPackageNameByUnknownId(newId);
    if (oldPackageName === newPackageName) {
      throw new BitError(`refactoring: the old package-name and the new package-name are the same: ${oldPackageName}`);
    }
    const changedComponents = await Promise.all(
      components.map(async (comp) => {
        const hasChanged = await this.replaceString(comp, oldPackageName, newPackageName);
        return hasChanged ? comp : null;
      })
    );
    return { oldPackageName, newPackageName, changedComponents: compact(changedComponents) };
  }

  /**
   * rename multiple packages dependencies.
   * this method changes the source code of the component, but doesn't write to the filesystem.
   */
  async replaceMultipleStrings(
    components: Component[],
    stringsToReplace: MultipleStringsReplacement
  ): Promise<{
    changedComponents: Component[];
  }> {
    const changedComponents = await Promise.all(
      components.map(async (comp) => {
        const hasChanged = await this.replaceMultipleStringsInOneComp(comp, stringsToReplace);
        return hasChanged ? comp : null;
      })
    );
    return { changedComponents: compact(changedComponents) };
  }

  private async getPackageNameByUnknownId(id: ComponentID | string): Promise<string> {
    if (id instanceof ComponentID) {
      return this.getPackageNameByComponentID(id);
    }
    if (typeof id !== 'string') {
      throw new Error(`getPackageNameByUnknownId expects id to be either string or ComponentID, got ${typeof id}`);
    }
    try {
      const host = this.componentMain.getHost();
      const componentID = await host.resolveComponentId(id);
      return await this.getPackageNameByComponentID(componentID);
    } catch (err) {
      if (this.isValidScopedPackageName(id)) {
        return id; // assume this is a package-name
      }
      throw new BitError(
        `refactoring: the id "${id}" is neither a valid scoped-package-name nor an existing component-id`
      );
    }
  }

  private async getPackageNameByComponentID(id: ComponentID) {
    const host = this.componentMain.getHost();
    const comp = await host.get(id);
    if (!comp) throw new Error(`unable to find a component: "${id.toString()}"`);
    return this.pkg.getPackageName(comp);
  }

  private isValidScopedPackageName(name: string) {
    return (
      name.startsWith('@') && name.includes('/') && name.length <= 214 && !name.includes('\\') && !name.includes('..')
    );
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

  private async replaceMultipleStringsInOneComp(
    comp: Component,
    stringsToReplace: MultipleStringsReplacement
  ): Promise<boolean> {
    const changed = await Promise.all(
      comp.filesystem.files.map(async (file) => {
        const isBinary = await isBinaryFile(file.contents);
        if (isBinary) return false;
        const strContent = file.contents.toString();
        let newContent = strContent;
        stringsToReplace.forEach(({ oldStr, newStr }) => {
          const oldStringRegex = new RegExp(oldStr, 'g');
          newContent = newContent.replace(oldStringRegex, newStr);
        });
        if (strContent !== newContent) {
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
