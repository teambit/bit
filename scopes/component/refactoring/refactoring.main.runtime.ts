import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { isBinaryFile } from 'isbinaryfile';
import camelCase from 'camelcase';
import { compact } from 'lodash';
import replacePackageName from '@teambit/legacy/dist/utils/string/replace-package-name';
import ComponentAspect, { Component, ComponentID, ComponentMain } from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import PkgAspect, { PkgMain } from '@teambit/pkg';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import {
  SourceFileTransformer,
  classNamesTransformer,
  functionNamesTransformer,
  importTransformer,
  exportTransformer,
  interfaceNamesTransformer,
  typeAliasNamesTransformer,
  variableNamesTransformer,
  transformSourceFile,
  expressionStatementTransformer,
  typeReferenceTransformer,
} from '@teambit/typescript';
import PrettierAspect, { PrettierMain } from '@teambit/prettier';
import { Formatter } from '@teambit/formatter';
import { RefactoringAspect } from './refactoring.aspect';
import { DependencyNameRefactorCmd, RefactorCmd } from './refactor.cmd';

export type MultipleStringsReplacement = Array<{ oldStr: string; newStr: string }>;

export class RefactoringMain {
  constructor(
    private componentMain: ComponentMain,
    private pkg: PkgMain,
    private envs: EnvsMain,
    private prettierMain: PrettierMain
  ) {}

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
        const hasChanged = await this.replacePackageNameInComponent(comp, oldPackageName, newPackageName);
        return hasChanged ? comp : null;
      })
    );
    return { oldPackageName, newPackageName, changedComponents: compact(changedComponents) };
  }

  /**
   * replaces the old-name inside the source code of the given component with the new name.
   * helpful when renaming/forking an aspect/env where the component-name is used as the class-name and variable-name.
   */
  async refactorVariableAndClasses(
    component: Component,
    sourceId: ComponentID,
    targetId: ComponentID,
    options?: { ast?: boolean }
  ) {
    if (options?.ast) {
      await this.refactorVariableAndClassesUsingAST(component, sourceId, targetId);
    } else {
      await this.replaceMultipleStrings(
        [component],
        [
          {
            oldStr: sourceId.name,
            newStr: targetId.name,
          },
          {
            oldStr: camelCase(sourceId.name),
            newStr: camelCase(targetId.name),
          },
          {
            oldStr: camelCase(sourceId.name, { pascalCase: true }),
            newStr: camelCase(targetId.name, { pascalCase: true }),
          },
        ]
      );
    }
  }

  async refactorVariableAndClassesUsingAST(component: Component, sourceId: ComponentID, targetId: ComponentID) {
    // transform kebabCase importPaths and PascalCase importNames
    await this.replaceMultipleStrings(
      [component],
      [
        {
          oldStr: sourceId.name,
          newStr: targetId.name,
        },
        {
          oldStr: camelCase(sourceId.name, { pascalCase: true }),
          newStr: camelCase(targetId.name, { pascalCase: true }),
        },
      ],
      [importTransformer, exportTransformer]
    );

    // transform camelCase variable and function names
    await this.replaceMultipleStrings(
      [component],
      [
        {
          oldStr: camelCase(sourceId.name),
          newStr: camelCase(targetId.name),
        },
      ],
      [variableNamesTransformer, functionNamesTransformer]
    );

    // transform PascalCase ClassNames
    await this.replaceMultipleStrings(
      [component],
      [
        {
          oldStr: camelCase(sourceId.name, { pascalCase: true }),
          newStr: camelCase(targetId.name, { pascalCase: true }),
        },
        {
          oldStr: camelCase(`${sourceId.name}Props`, { pascalCase: true }),
          newStr: camelCase(`${targetId.name}Props`, { pascalCase: true }),
        },
      ],
      [
        typeReferenceTransformer,
        typeAliasNamesTransformer,
        functionNamesTransformer,
        interfaceNamesTransformer,
        variableNamesTransformer,
        classNamesTransformer,
        expressionStatementTransformer,
      ]
    );
  }

  refactorFilenames(component: Component, sourceId: ComponentID, targetId: ComponentID) {
    component.filesystem.files.forEach((file) => {
      if (file.relative.includes(sourceId.name)) {
        file.updatePaths({ newRelative: file.relative.replace(sourceId.name, targetId.name) });
      }
    });
  }

  /**
   * rename multiple packages dependencies.
   * this method changes the source code of the component, but doesn't write to the filesystem.
   */
  async replaceMultipleStrings(
    components: Component[],
    stringsToReplace: MultipleStringsReplacement = [],
    transformers?: SourceFileTransformer[]
  ): Promise<{
    changedComponents: Component[];
  }> {
    const changedComponents = await Promise.all(
      components.map(async (comp) => {
        const hasChanged = await this.replaceMultipleStringsInOneComp(comp, stringsToReplace, transformers);
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

  private async replacePackageNameInComponent(comp: Component, oldPkg: string, newPkg: string): Promise<boolean> {
    const changed = await Promise.all(
      comp.filesystem.files.map(async (file) => {
        const isBinary = await isBinaryFile(file.contents);
        if (isBinary) {
          return false;
        }
        const strContent = file.contents.toString();
        const newStrContent = replacePackageName(strContent, oldPkg, newPkg);
        if (strContent === newStrContent) {
          return false;
        }
        file.contents = Buffer.from(newStrContent);
        return true;
      })
    );
    return changed.some((c) => c);
  }

  private getDefaultFormatter(): Formatter {
    return this.prettierMain.createFormatter(
      { check: false },
      {
        config: {
          parser: 'typescript',
          trailingComma: 'es5',
          tabWidth: 2,
          singleQuote: true,
        },
      }
    );
  }

  private async replaceMultipleStringsInOneComp(
    comp: Component,
    stringsToReplace: MultipleStringsReplacement,
    transformers?: SourceFileTransformer[]
  ): Promise<boolean> {
    const updates = stringsToReplace.reduce((acc, { oldStr, newStr }) => ({ ...acc, [oldStr]: newStr }), {});

    const changed = await Promise.all(
      comp.filesystem.files.map(async (file) => {
        const isBinary = await isBinaryFile(file.contents);
        if (isBinary) return false;
        const strContent = file.contents.toString();
        let newContent = strContent;
        if (transformers?.length) {
          const transformerFactories = transformers.map((t) => t(updates));
          newContent = await transformSourceFile(file.path, strContent, transformerFactories, undefined, updates);
        } else {
          stringsToReplace.forEach(({ oldStr, newStr }) => {
            const oldStringRegex = new RegExp(oldStr, 'g');
            newContent = newContent.replace(oldStringRegex, newStr);
          });
        }
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
  static dependencies = [ComponentAspect, PkgAspect, CLIAspect, EnvsAspect, PrettierAspect];
  static runtime = MainRuntime;
  static async provider([componentMain, pkg, cli, envMain, prettierMain]: [
    ComponentMain,
    PkgMain,
    CLIMain,
    EnvsMain,
    PrettierMain
  ]) {
    const refactoringMain = new RefactoringMain(componentMain, pkg, envMain, prettierMain);
    const subCommands = [new DependencyNameRefactorCmd(refactoringMain, componentMain)];
    const refactorCmd = new RefactorCmd();
    refactorCmd.commands = subCommands;
    cli.register(refactorCmd);
    return refactoringMain;
  }
}

RefactoringAspect.addRuntime(RefactoringMain);
