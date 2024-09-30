import { BitError } from '@teambit/bit-error';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { importTransformer, exportTransformer } from '@teambit/typescript';
import { ComponentAspect, Component, ComponentMain } from '@teambit/component';
import { ComponentDependency, DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ComponentConfig } from '@teambit/generator';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { isHash } from '@teambit/component-version';
import { InstallAspect, InstallMain } from '@teambit/install';
import { ComponentID, ComponentIdObj, ComponentIdList } from '@teambit/component-id';
import { NewComponentHelperAspect, NewComponentHelperMain } from '@teambit/new-component-helper';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { RefactoringAspect, MultipleStringsReplacement, RefactoringMain } from '@teambit/refactoring';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { snapToSemver } from '@teambit/component-package-version';
import { uniqBy } from 'lodash';
import pMapSeries from 'p-map-series';
import { parse } from 'semver';
import { ForkCmd, ForkOptions } from './fork.cmd';
import { ForkingAspect } from './forking.aspect';
import { ForkingFragment } from './forking.fragment';
import { forkingSchema } from './forking.graphql';
import { ScopeForkCmd, ScopeForkOptions } from './scope-fork.cmd';

export type ForkInfo = {
  forkedFrom: ComponentID;
};

type MultipleForkInfo = {
  targetCompId: ComponentID;
  sourceId: string;
  component: Component;
};

type MultipleComponentsToFork = Array<{
  sourceId: string;
  targetId?: string; // if not specified, it'll be the same as the source
  targetScope?: string; // if not specified, it'll be taken from the options or from the default scope
  path?: string; // if not specified, use the default component path
  env?: string; // if not specified, use the default env
  config?: ComponentConfig; // if specified, adds to/overrides the existing config
}>;

type MultipleForkOptions = {
  refactor?: boolean;
  scope?: string; // different scope-name than the original components
  install?: boolean; // whether to run "bit install" once done.
  ast?: boolean; // whether to use AST to transform files instead of regex
};

export class ForkingMain {
  constructor(
    private workspace: Workspace,
    private install: InstallMain,
    private dependencyResolver: DependencyResolverMain,
    private newComponentHelper: NewComponentHelperMain,
    private refactoring: RefactoringMain,
    private pkg: PkgMain
  ) {}

  /**
   * create a new copy of existing/remote component.
   * the new component holds a reference to the old one for future reference.
   * if refactor option is enable, change the source-code to update all dependencies with the new name.
   */
  async fork(sourceId: string, targetId?: string, options?: ForkOptions): Promise<ComponentID> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const sourceCompId = await this.workspace.resolveComponentId(sourceId);
    const exists = this.workspace.exists(sourceCompId);
    if (exists) {
      const existingInWorkspace = await this.workspace.get(sourceCompId);
      return this.forkExistingInWorkspace(existingInWorkspace, targetId, options);
    }
    const sourceIdWithScope = sourceCompId._legacy.scope ? sourceCompId : ComponentID.fromString(sourceId);
    const { targetCompId, component } = await this.forkRemoteComponent(sourceIdWithScope, targetId, options);
    await this.saveDeps(component);
    if (!options?.skipDependencyInstallation) await this.installDeps();
    return targetCompId;
  }

  /**
   * get the forking data, such as the source where a component was forked from
   */
  getForkInfo(component: Component): ForkInfo | null {
    const forkConfig = component.state.aspects.get(ForkingAspect.id)?.config as ForkConfig | undefined;
    if (!forkConfig) return null;
    return {
      forkedFrom: ComponentID.fromObject(forkConfig.forkedFrom),
    };
  }

  async forkMultipleFromRemote(componentsToFork: MultipleComponentsToFork, options: MultipleForkOptions = {}) {
    const componentsToForkSorted = this.sortComponentsToFork(componentsToFork);
    const { scope } = options;
    const results = await pMapSeries(
      componentsToForkSorted,
      async ({ sourceId, targetId, path, env, config, targetScope }) => {
        const sourceCompId = await this.workspace.resolveComponentId(sourceId);
        const sourceIdWithScope = sourceCompId._legacy.scope ? sourceCompId : ComponentID.fromString(sourceId);
        const { targetCompId, component } = await this.forkRemoteComponent(
          sourceIdWithScope,
          targetId,
          {
            scope: targetScope || scope,
            path,
            env,
            config,
          },
          false
        );
        return { targetCompId, sourceId, component };
      }
    );
    await this.refactorMultipleAndInstall(results, options);
  }

  /**
   * sort the components to fork so that components without "env" prop will be forked first.
   * this way, if some components are envs, their "env" prop is empty and will be forked first, then components that
   * depends on them.
   * otherwise, forking the components first result in errors when loading them as their envs are missing at that point
   */
  private sortComponentsToFork(componentsToFork: MultipleComponentsToFork) {
    return componentsToFork.sort((a, b) => {
      if (a.env && b.env) return 0;
      if (a.env) return 1;
      return -1;
    });
  }

  private async refactorMultipleAndInstall(results: MultipleForkInfo[], options: MultipleForkOptions = {}) {
    const oldPackages: string[] = [];
    const stringsToReplace: MultipleStringsReplacement = results
      .map(({ targetCompId, sourceId, component }) => {
        const oldPackageName = this.pkg.getPackageName(component);
        oldPackages.push(oldPackageName);
        const newName = targetCompId.fullName.replace(/\//g, '.');
        const scopeToReplace = targetCompId.scope.replace('.', '/');
        const newPackageName = `@${scopeToReplace}.${newName}`;
        return [
          { oldStr: oldPackageName, newStr: newPackageName },
          { oldStr: sourceId, newStr: targetCompId.toStringWithoutVersion() },
        ];
      })
      .flat();

    const stringsToReplaceForVariable: MultipleStringsReplacement = results
      .map(({ targetCompId, sourceId }) => {
        const sourceCompId = ComponentID.fromString(sourceId);
        if (sourceCompId.name === targetCompId.name) return [];
        return this.refactoring.getStringReplacementsForVariablesAndClasses(sourceCompId, targetCompId);
      })
      .flat();

    const allComponents = await this.workspace.list();
    if (options.refactor) {
      const { changedComponents } = await this.refactoring.replaceMultipleStrings(
        allComponents,
        stringsToReplace,
        options.ast ? [importTransformer, exportTransformer] : undefined
      );
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));

      const { changedComponents: changedComponentsVariables } = await this.refactoring.replaceMultipleStrings(
        allComponents,
        stringsToReplaceForVariable,
        options.ast ? [importTransformer, exportTransformer] : undefined,
        true
      );

      await Promise.all(changedComponentsVariables.map((comp) => this.workspace.write(comp)));
    }
    const forkedComponents = results.map((result) => result.component);
    const policy = await Promise.all(forkedComponents.map((comp) => this.extractDeps(comp)));
    const policyFlatAndUnique = uniqBy(policy.flat(), 'dependencyId');
    const policyWithoutWorkspaceComps = policyFlatAndUnique.filter((dep) => !oldPackages.includes(dep.dependencyId));
    this.dependencyResolver.addToRootPolicy(policyWithoutWorkspaceComps, { updateExisting: true });
    await this.dependencyResolver.persistConfig('fork');
    if (options.install) {
      await this.installDeps();
    }
  }

  /**
   * fork all components of the given scope
   */
  async forkScope(
    originalScope: string,
    newOptionalScope?: string, // if not specified, it'll be the default scope
    pattern?: string,
    options?: ScopeForkOptions
  ): Promise<ComponentID[]> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const newScope = newOptionalScope || this.workspace.defaultScope;
    const allIdsFromOriginalScope = await this.workspace.scope.listRemoteScope(originalScope);
    if (!allIdsFromOriginalScope.length) {
      throw new Error(`unable to find components to fork from ${originalScope}`);
    }
    const getPatternWithScopeName = () => {
      if (!pattern) return undefined;
      if (pattern.startsWith(`${originalScope}/`)) return pattern;
      return `${originalScope}/${pattern}`;
    };
    const patternWithScopeName = getPatternWithScopeName();
    const idsFromOriginalScope = patternWithScopeName
      ? await this.workspace.scope.filterIdsFromPoolIdsByPattern(patternWithScopeName, allIdsFromOriginalScope)
      : allIdsFromOriginalScope;
    const workspaceIds = this.workspace.listIds();
    const workspaceBitIds = ComponentIdList.fromArray(workspaceIds.map((id) => id));
    idsFromOriginalScope.forEach((id) => {
      const existInWorkspace = workspaceBitIds.searchWithoutVersion(id);
      if (existInWorkspace) {
        throw new Error(
          `unable to fork "${id.toString()}". the workspace has a component "${existInWorkspace.toString()}" with the same name and same scope`
        );
      }
    });
    const multipleForkInfo: MultipleForkInfo[] = [];
    const components = await this.workspace.scope.getManyRemoteComponents(idsFromOriginalScope);
    await pMapSeries(components, async (component) => {
      const config = await this.getConfig(component);
      const targetCompId = ComponentID.fromObject({ name: component.id.fullName }, newScope);
      await this.newComponentHelper.writeAndAddNewComp(
        component,
        targetCompId,
        {
          scope: newScope,
          incrementPathIfConflicted: true,
        },
        config
      );
      multipleForkInfo.push({ targetCompId, sourceId: component.id.toStringWithoutVersion(), component });
    });
    await this.refactorMultipleAndInstall(multipleForkInfo, {
      refactor: true,
      install: !options?.skipDependencyInstallation,
      ast: options?.ast,
    });
    return multipleForkInfo.map((info) => info.targetCompId);
  }

  private async forkExistingInWorkspace(existing: Component, targetId?: string, options?: ForkOptions) {
    targetId = targetId || existing.id.fullName;
    const targetCompId = this.newComponentHelper.getNewComponentId(targetId, undefined, options?.scope);

    const config = await this.getConfig(existing, options);
    await this.newComponentHelper.writeAndAddNewComp(existing, targetCompId, options, config);
    if (options?.refactor) {
      const allComponents = await this.workspace.list();
      const { changedComponents } = await this.refactoring.refactorDependencyName(allComponents, existing.id, targetId);
      await Promise.all(changedComponents.map((comp) => this.workspace.write(comp)));
    }
    return targetCompId;
  }

  private async forkRemoteComponent(
    sourceId: ComponentID,
    targetId?: string,
    options?: ForkOptions,
    shouldRefactorVariablesAndClasses = true
  ): Promise<{
    targetCompId: ComponentID;
    component: Component;
  }> {
    if (options?.refactor) {
      throw new BitError(`the component ${sourceId.toStringWithoutVersion()} is not in the workspace, you can't use the --refactor flag.
the reason is that the refactor changes the components using ${sourceId.toStringWithoutVersion()}, since it's not in the workspace, no components were using it, so nothing to refactor`);
    }
    const targetName = targetId || sourceId.fullName;
    const targetCompId = this.newComponentHelper.getNewComponentId(targetName, undefined, options?.scope);
    const component = await this.workspace.scope.getRemoteComponent(sourceId);
    await this.refactoring.replaceMultipleStrings(
      [component],
      [
        {
          oldStr: sourceId.toStringWithoutVersion(),
          newStr: targetCompId.toStringWithoutVersion(),
        },
      ],
      options?.ast ? [importTransformer, exportTransformer] : undefined
    );
    if (!options?.preserve) {
      if (shouldRefactorVariablesAndClasses) {
        await this.refactoring.refactorVariableAndClasses(component, sourceId, targetCompId, options);
      }
      this.refactoring.refactorFilenames(component, sourceId, targetCompId);
    }
    const config = await this.getConfig(component, options);
    await this.newComponentHelper.writeAndAddNewComp(component, targetCompId, options, config);

    return { targetCompId, component };
  }

  private async saveDeps(component: Component) {
    const workspacePolicyEntries = this.extractDeps(component);
    this.dependencyResolver.addToRootPolicy(workspacePolicyEntries, { updateExisting: true });
    await this.dependencyResolver.persistConfig('fork (save deps)');
  }

  private async installDeps() {
    await this.install.install(undefined, {
      dedupe: true,
      import: false,
      copyPeerToRuntimeOnRoot: true,
      copyPeerToRuntimeOnComponents: false,
      updateExisting: false,
    });
  }

  private extractDeps(component: Component) {
    const deps = this.dependencyResolver.getDependencies(component);
    const excludePackages = ['@teambit/legacy'];
    const excludeCompIds = this.dependencyResolver.getCompIdsThatShouldNotBeInPolicy();
    return deps
      .filter((dep) => dep.source === 'auto')
      .filter((dep) => {
        if (dep instanceof ComponentDependency) {
          const compIdStr = dep.componentId.toStringWithoutVersion();
          return !excludeCompIds.includes(compIdStr);
        }
        return !excludePackages.includes(dep.id);
      })
      .map((dep) => {
        const parsedVersion = parse(dep.version);
        const versionWithPrefix = parsedVersion
          ? this.dependencyResolver.getVersionWithSavePrefix({ version: dep.version })
          : dep.version;
        const version = isHash(versionWithPrefix) ? snapToSemver(versionWithPrefix) : versionWithPrefix;
        return {
          dependencyId: dep.getPackageName?.() || dep.id,
          lifecycleType: dep.lifecycle === 'dev' ? 'runtime' : dep.lifecycle,
          value: {
            version,
          },
        };
      });
  }

  private async getConfig(comp: Component, options?: ForkOptions) {
    const config = options?.config || {};
    const fromExisting = options?.skipConfig
      ? {}
      : await this.newComponentHelper.getConfigFromExistingToNewComponent(comp);
    const linkToOriginal = options?.noLink ? {} : { [ForkingAspect.id]: { forkedFrom: comp.id.toObject() } };
    return {
      ...fromExisting,
      ...linkToOriginal,
      ...config,
    };
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    DependencyResolverAspect,
    ComponentAspect,
    NewComponentHelperAspect,
    GraphqlAspect,
    RefactoringAspect,
    PkgAspect,
    InstallAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    dependencyResolver,
    componentMain,
    newComponentHelper,
    graphql,
    refactoring,
    pkg,
    install,
  ]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    ComponentMain,
    NewComponentHelperMain,
    GraphqlMain,
    RefactoringMain,
    PkgMain,
    InstallMain,
  ]) {
    const forkingMain = new ForkingMain(workspace, install, dependencyResolver, newComponentHelper, refactoring, pkg);
    cli.register(new ForkCmd(forkingMain));
    graphql.register(forkingSchema(forkingMain));
    componentMain.registerShowFragments([new ForkingFragment(forkingMain)]);

    const scopeCommand = cli.getCommand('scope');
    scopeCommand?.commands?.push(new ScopeForkCmd(forkingMain));

    return forkingMain;
  }
}

ForkingAspect.addRuntime(ForkingMain);

export type ForkConfig = {
  forkedFrom: ComponentIdObj;
};
