import fs from 'fs-extra';
import path from 'path';
import { BitError } from '@teambit/bit-error';
import { InvalidScopeName, isValidScopeName } from '@teambit/legacy-bit-id';
import { MainRuntime } from '@teambit/cli';
import { Component } from '@teambit/component';
import { TrackerAspect, TrackerMain } from '@teambit/tracker';
import { isDirEmpty } from '@teambit/legacy.utils';
import { ComponentID } from '@teambit/component-id';
import { Harmony } from '@teambit/harmony';
import { PathLinuxRelative } from '@teambit/legacy.utils';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { PkgAspect } from '@teambit/pkg';
import { RenamingAspect } from '@teambit/renaming';
import { EnvsAspect } from '@teambit/envs';
import { NewComponentHelperAspect } from './new-component-helper.aspect';
import { incrementPathRecursively } from '@teambit/component-writer';

const aspectsConfigToIgnore: string[] = [PkgAspect.id, RenamingAspect.id];

export class NewComponentHelperMain {
  constructor(private workspace: Workspace, private harmony: Harmony, private tracker: TrackerMain) {}
  /**
   * when creating/forking a component, the user provides the new name and optionally the scope/namespace.
   * from this user input, create a ComponentID.
   */
  getNewComponentId(name: string, namespace?: string, scope?: string): ComponentID {
    scope = scope || this.workspace.defaultScope;
    if (!isValidScopeName(scope)) {
      throw new InvalidScopeName(scope);
    }
    if (!scope) throw new BitError(`failed finding defaultScope`);

    const fullComponentName = namespace ? `${namespace}/${name}` : name;
    return ComponentID.fromObject({ name: fullComponentName }, scope);
  }

  /**
   * when creating/forking a component, the user may or may not provide a path.
   * if not provided, generate the path based on the component-id.
   * the component will be written to that path.
   */
  getNewComponentPath(
    componentId: ComponentID,
    {
      pathFromUser,
      componentsToCreate,
      incrementPathIfConflicted,
    }: { pathFromUser?: string; componentsToCreate?: number; incrementPathIfConflicted?: boolean } = {}
  ): PathLinuxRelative {
    if (pathFromUser) {
      const fullPath = path.join(this.workspace.path, pathFromUser);
      const componentPath = componentId.fullName;
      const dirExists = fs.pathExistsSync(fullPath);
      if (componentsToCreate && componentsToCreate === 1) {
        return dirExists ? path.join(pathFromUser, componentPath) : pathFromUser;
      }
      if (componentsToCreate && componentsToCreate > 1) {
        return path.join(pathFromUser, componentPath);
      }
      return pathFromUser;
    }

    const generatedPath = this.workspace.consumer.composeRelativeComponentPath(
      componentId.changeScope(componentId.scope)
    );
    if (!incrementPathIfConflicted) {
      return generatedPath;
    }

    const existingPaths = this.workspace.bitMap.getAllRootDirs();
    // e.g. existing "bar/foo" and currently writing "bar"
    const existingParent = existingPaths.find((d) => d.startsWith(`${generatedPath}/`));
    const existingExact = existingPaths.find((d) => d === generatedPath);
    // e.g. existing "bar" and currently writing "bar/foo"
    const existingChild = existingPaths.find((p) => generatedPath.startsWith(p));
    if (existingParent || existingExact || existingChild) {
      // if existingChild, you can't increment the generatedPath, it'll still be a sub-directory of the existingChild
      const pathToIncrement = existingChild || generatedPath;
      return incrementPathRecursively(pathToIncrement, existingPaths);
    }
    return generatedPath;
  }

  async writeAndAddNewComp(
    comp: Component,
    targetId: ComponentID,
    options?: { path?: string; scope?: string; env?: string; incrementPathIfConflicted?: boolean },
    config?: { [aspectName: string]: any }
  ) {
    const targetPath = this.getNewComponentPath(targetId, {
      pathFromUser: options?.path,
      incrementPathIfConflicted: options?.incrementPathIfConflicted,
    });
    await this.throwForExistingPath(targetPath);
    await this.workspace.write(comp, targetPath);
    if (options?.env && config) {
      const oldEnv = config[EnvsAspect.id]?.env;
      if (oldEnv) {
        const envKey = Object.keys(config).find((key) => key.startsWith(oldEnv));
        if (envKey) {
          delete config[envKey];
        }
      }
      await this.tracker.addEnvToConfig(options.env, config);
    }
    try {
      await this.tracker.track({
        rootDir: targetPath,
        componentName: targetId.fullName,
        mainFile: comp.state._consumer.mainFile,
        defaultScope: options?.scope || this.workspace.defaultScope,
        config,
      });
    } catch (err) {
      await fs.remove(targetPath);
      throw err;
    }

    await this.workspace.bitMap.write(`adding ${targetId.toString()}`);
    await this.workspace.clearCache();
    // this takes care of compiling the component as well
    await this.workspace.triggerOnComponentAdd(targetId, { compile: true });
  }

  private async throwForExistingPath(targetPath: string) {
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) {
        throw new BitError(`unable to create component at "${targetPath}", this path already exists`);
      }
      const isEmpty = await isDirEmpty(targetPath);
      if (!isEmpty) {
        throw new BitError(`unable to create component at "${targetPath}", this directory is not empty`);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  async getConfigFromExistingToNewComponent(comp: Component) {
    const fromExisting = {};
    comp.state.aspects.entries.forEach((entry) => {
      if (!entry.config) return;
      const aspectId = entry.id.toString();
      // don't copy config of aspects that are not relevant for the new component
      // (e.g. pkg aspect config might contain values that are bounded to the other component name / id)
      if (aspectsConfigToIgnore.includes(aspectId)) {
        return;
      }
      fromExisting[aspectId] = entry.config;
    });
    return fromExisting;
  }

  static slots = [];
  static dependencies = [WorkspaceAspect, TrackerAspect];
  static runtime = MainRuntime;
  static async provider([workspace, tracker]: [Workspace, TrackerMain], config, _, harmony: Harmony) {
    return new NewComponentHelperMain(workspace, harmony, tracker);
  }
}

NewComponentHelperAspect.addRuntime(NewComponentHelperMain);
