import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { compact } from 'lodash';
import { BitError } from '@teambit/bit-error';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import { BuilderAspect } from '@teambit/builder';
import type { ModelComponent, Version } from '@teambit/objects';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { DependencyList, DependencyResolverMain, SerializedDependency } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { DiffOptions, DiffResults, FieldsDiff, FileDiff } from '@teambit/legacy.component-diff';
import { getFilesDiff, diffBetweenComponentsObjects } from '@teambit/legacy.component-diff';
import type { TesterMain } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import { componentCompareSchema } from './component-compare.graphql';
import { ComponentCompareAspect } from './component-compare.aspect';
import { DiffCmd } from './diff-cmd';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';

export type ComponentCompareResult = {
  id: string;
  code: FileDiff[];
  fields: FieldsDiff[];
  tests: FileDiff[];
};

type ConfigDiff = {
  version?: string;
  dependencies?: string[];
  aspects?: Record<string, any>;
};

export class ComponentCompareMain {
  constructor(
    private componentAspect: ComponentMain,
    private scope: ScopeMain,
    private logger: Logger,
    private tester: TesterMain,
    private depResolver: DependencyResolverMain,
    private importer: ImporterMain,
    private workspace?: Workspace
  ) {}

  async compare(baseIdStr: string, compareIdStr: string): Promise<ComponentCompareResult> {
    const host = this.componentAspect.getHost();
    const [baseCompId, compareCompId] = await host.resolveMultipleComponentIds([baseIdStr, compareIdStr]);
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(compareCompId);
    const comparingWithLocalChanges = this.workspace && baseIdStr === compareIdStr;

    if (!modelComponent) {
      throw new BitError(`component ${compareCompId.toString()} doesn't have any version yet`);
    }

    // import missing components that might be on main
    await this.importer.importObjectsFromMainIfExist([baseCompId, compareCompId], {
      cache: true,
    });

    const baseVersion = baseCompId.version as string;
    const compareVersion = compareCompId.version as string;

    const components = await host.getMany([baseCompId, compareCompId]);
    const baseComponent = components?.[0];
    const compareComponent = components?.[1];
    const componentWithoutVersion = await host.get((baseCompId || compareCompId).changeVersion(undefined));

    const diff = componentWithoutVersion
      ? await this.computeDiff(
          componentWithoutVersion,
          comparingWithLocalChanges ? undefined : baseVersion,
          comparingWithLocalChanges ? undefined : compareVersion,
          {}
        )
      : {
          filesDiff: [],
          fieldsDiff: [],
        };

    const baseTestFiles =
      (baseComponent && (await this.tester.getTestFiles(baseComponent).map((file) => file.relative))) || [];
    const compareTestFiles =
      (compareComponent && (await this.tester.getTestFiles(compareComponent).map((file) => file.relative))) || [];

    const allTestFiles = [...baseTestFiles, ...compareTestFiles];

    const testFilesDiff = (diff.filesDiff || []).filter(
      (fileDiff: FileDiff) => allTestFiles.includes(fileDiff.filePath) && fileDiff.status !== 'UNCHANGED'
    );

    const compareResult = {
      id: `${baseCompId}-${compareCompId}`,
      code: diff.filesDiff || [],
      fields: diff.fieldsDiff || [],
      tests: testFilesDiff,
    };

    return compareResult;
  }

  async diffByCLIValues(
    pattern?: string,
    version?: string,
    toVersion?: string,
    { verbose, table, parent }: { verbose?: boolean; table?: boolean; parent?: boolean } = {}
  ): Promise<any> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const ids = pattern ? await this.workspace.idsByPattern(pattern) : await this.workspace.listTagPendingIds();
    const consumer = this.workspace.consumer;
    if (!ids.length) {
      return [];
    }
    const diffResults = await this.componentsDiff(ids, version, toVersion, {
      verbose,
      formatDepsAsTable: table,
      compareToParent: parent,
    });
    await consumer.onDestroy('diff');
    return diffResults;
  }

  async getConfigForDiffById(id: string): Promise<ConfigDiff> {
    const workspace = this.workspace;
    if (!workspace) throw new OutsideWorkspaceError();
    const componentId = await workspace.resolveComponentId(id);
    const component = await workspace.scope.get(componentId, false);
    if (!component) throw new Error(`getConfigForDiff: unable to find component ${id} in local scope`);
    return this.getConfigForDiffByCompObject(component);
  }

  async getConfigForDiffByCompObject(component: Component, modifiedIds?: ComponentID[]) {
    const depData = this.depResolver.getDependencies(component);
    const modifiedIdsStr = modifiedIds?.map((id) => id.toStringWithoutVersion());
    const serializedToString = (dep: SerializedDependency) => {
      const idWithoutVersion = dep.__type === 'package' ? dep.id : dep.id.split('@')[0];
      const version = modifiedIdsStr?.includes(idWithoutVersion) ? `<modified>` : dep.version;
      return `${idWithoutVersion}@${version} (${dep.lifecycle}) ${dep.source ? `(${dep.source})` : ''}`;
    };
    const serializeAndSort = (deps: DependencyList) => {
      const serialized = deps.serialize().map(serializedToString);
      return serialized.sort();
    };
    const serializeAspect = (comp: Component) => {
      const aspects = comp.state.aspects.withoutEntries([BuilderAspect.id, DependencyResolverAspect.id]);
      // return aspects.serialize();
      return aspects.toLegacy().sortById().toConfigObject();
    };
    return {
      version: component.id.version,
      dependencies: serializeAndSort(depData),
      aspects: serializeAspect(component),
    };
  }

  private async componentsDiff(
    ids: ComponentID[],
    version: string | undefined,
    toVersion: string | undefined,
    diffOpts: DiffOptions
  ): Promise<DiffResults[]> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const components = await this.workspace.getMany(ids);
    if (!components.length) throw new BitError('failed loading the components');
    if (toVersion && !version)
      throw new BitError('error: componentsDiff expects to get version when toVersion is entered');
    const componentsDiffResults = await Promise.all(
      components.map((component) => this.computeDiff(component, version, toVersion, diffOpts))
    );
    return componentsDiffResults;
  }

  /**
   * this method operates in two modes:
   * 1. workspace mode - the version and toVersion can be undefined.
   * 2. scope mode - the version and toVersion are mandatory.
   */
  private async computeDiff(
    component: Component,
    version: string | undefined,
    toVersion: string | undefined,
    diffOpts: DiffOptions
  ): Promise<DiffResults> {
    const consumerComponent = component.state._consumer as ConsumerComponent;

    const diffResult: DiffResults = { id: component.id, hasDiff: false };
    const modelComponent =
      consumerComponent.modelComponent || (await this.scope.legacyScope.getModelComponentIfExist(component.id));

    if (this.workspace && component.isDeleted()) {
      // component exists in the model but not in the filesystem, show all files as deleted
      const modelFiles = consumerComponent.files;
      diffResult.filesDiff = await getFilesDiff(modelFiles, [], component.id.version, component.id.version);
      if (hasDiff(diffResult)) diffResult.hasDiff = true;
      return diffResult;
    }
    if (!modelComponent) {
      if (version || toVersion) {
        throw new BitError(`component ${component.id.toString()} doesn't have any version yet`);
      }
      // it's a new component. not modified. show all files as new.
      const fsFiles = consumerComponent.files;
      diffResult.filesDiff = await getFilesDiff([], fsFiles, component.id.version, component.id.version);
      if (hasDiff(diffResult)) diffResult.hasDiff = true;
      return diffResult;
    }
    const repository = this.scope.legacyScope.objects;
    const idsToImport = compact([
      version ? component.id.changeVersion(version) : undefined,
      toVersion ? component.id.changeVersion(toVersion) : undefined,
    ]);
    const idList = ComponentIdList.fromArray(idsToImport);
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(idList, { cache: true, reason: 'to show diff' });
    if (diffOpts.compareToParent) {
      if (!version) throw new BitError('--parent flag expects to get version');
      if (toVersion) throw new BitError('--parent flag expects to get only one version');
      const versionObject = await modelComponent.loadVersion(version, repository);
      const parent = versionObject.parents[0];
      toVersion = version;
      version = parent ? modelComponent.getTagOfRefIfExists(parent) : undefined;
    }
    const fromVersionObject = version ? await modelComponent.loadVersion(version, repository) : undefined;
    const toVersionObject = toVersion ? await modelComponent.loadVersion(toVersion, repository) : undefined;
    const fromVersionFiles = await fromVersionObject?.modelFilesToSourceFiles(repository);
    const toVersionFiles = await toVersionObject?.modelFilesToSourceFiles(repository);

    const fromFiles = fromVersionFiles || consumerComponent.componentFromModel?.files;
    if (!fromFiles)
      throw new Error(
        `computeDiff: fromFiles must be defined for ${component.id.toString()}. if on workspace, consumerComponent.componentFromModel must be set. if on scope, fromVersionFiles must be set`
      );
    const toFiles = toVersionFiles || consumerComponent.files;
    const fromVersionLabel = version || component.id.version;
    const toVersionLabel = toVersion || component.id.version;

    diffResult.filesDiff = await getFilesDiff(fromFiles!, toFiles, fromVersionLabel, toVersionLabel);
    const fromVersionComponent = version
      ? await modelComponent.toConsumerComponent(version, this.scope.legacyScope.name, repository)
      : consumerComponent.componentFromModel;

    const toVersionComponent = toVersion
      ? await modelComponent.toConsumerComponent(toVersion, this.scope.legacyScope.name, repository)
      : consumerComponent;

    if (!fromVersionComponent) {
      throw new Error(
        `computeDiff: fromVersionComponent must be defined for ${component.id.toString()}. if on workspace, consumerComponent.componentFromModel must be set. if on scope, "version" must be set`
      );
    }

    await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);

    return diffResult;
  }

  async diffBetweenVersionsObjects(
    modelComponent: ModelComponent,
    fromVersionObject: Version,
    toVersionObject: Version,
    fromVersion: string,
    toVersion: string,
    diffOpts: DiffOptions
  ) {
    const diffResult: DiffResults = { id: modelComponent.toComponentId(), hasDiff: false };
    const scope = this.scope.legacyScope;
    const repository = scope.objects;
    const fromVersionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
    const toVersionFiles = await toVersionObject.modelFilesToSourceFiles(repository);
    const color = diffOpts.color ?? true;
    diffResult.filesDiff = await getFilesDiff(
      fromVersionFiles,
      toVersionFiles,
      fromVersion,
      toVersion,
      undefined,
      color
    );
    const fromVersionComponent = await modelComponent.toConsumerComponent(
      fromVersionObject.hash().toString(),
      scope.name,
      repository
    );
    const toVersionComponent = await modelComponent.toConsumerComponent(
      toVersionObject.hash().toString(),
      scope.name,
      repository
    );
    await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);
    return diffResult;
  }

  static slots = [];
  static dependencies = [
    GraphqlAspect,
    ComponentAspect,
    ScopeAspect,
    LoggerAspect,
    CLIAspect,
    WorkspaceAspect,
    TesterAspect,
    DependencyResolverAspect,
    ImporterAspect,
  ];
  static runtime = MainRuntime;
  static async provider([graphql, component, scope, loggerMain, cli, workspace, tester, depResolver, importer]: [
    GraphqlMain,
    ComponentMain,
    ScopeMain,
    LoggerMain,
    CLIMain,
    Workspace,
    TesterMain,
    DependencyResolverMain,
    ImporterMain,
  ]) {
    const logger = loggerMain.createLogger(ComponentCompareAspect.id);
    const componentCompareMain = new ComponentCompareMain(
      component,
      scope,
      logger,
      tester,
      depResolver,
      importer,
      workspace
    );
    cli.register(new DiffCmd(componentCompareMain));
    graphql.register(() => componentCompareSchema(componentCompareMain));
    return componentCompareMain;
  }
}

function hasDiff(diffResult: DiffResults): boolean {
  return !!((diffResult.filesDiff && diffResult.filesDiff.find((file) => file.diffOutput)) || diffResult.fieldsDiff);
}

async function updateFieldsDiff(
  componentA: ConsumerComponent,
  componentB: ConsumerComponent,
  diffResult: DiffResults,
  diffOpts: DiffOptions
) {
  diffResult.fieldsDiff = await diffBetweenComponentsObjects(componentA, componentB, diffOpts);
  diffResult.hasDiff = hasDiff(diffResult);
}

ComponentCompareAspect.addRuntime(ComponentCompareMain);

export default ComponentCompareMain;
