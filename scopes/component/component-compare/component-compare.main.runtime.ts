import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { BuilderAspect } from '@teambit/builder';
import { ModelComponent, Version } from '@teambit/legacy/dist/scope/models';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import {
  DependencyResolverAspect,
  DependencyList,
  DependencyResolverMain,
  SerializedDependency,
} from '@teambit/dependency-resolver';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import {
  DiffOptions,
  DiffResults,
  FieldsDiff,
  FileDiff,
  getFilesDiff,
} from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import { diffBetweenComponentsObjects } from '@teambit/legacy/dist/consumer/component-ops/components-object-diff';
import { TesterMain, TesterAspect } from '@teambit/tester';
import { ComponentAspect, Component, ComponentMain } from '@teambit/component';
import { ImporterAspect, ImporterMain } from '@teambit/importer';
import { componentCompareSchema } from './component-compare.graphql';
import { ComponentCompareAspect } from './component-compare.aspect';
import { DiffCmd } from './diff-cmd';

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

    if (!modelComponent) {
      throw new BitError(`component ${compareCompId.toString()} doesn't have any version yet`);
    }

    // import missing components that might be on main
    await this.importer.importObjectsFromMainIfExist([baseCompId, compareCompId], {
      cache: true,
    });

    const baseVersion = baseCompId.version as string;
    const compareVersion = compareCompId.version as string;

    const repository = this.scope.legacyScope.objects;
    const baseVersionObject = await modelComponent.loadVersion(baseVersion, repository);
    const compareVersionObject = await modelComponent.loadVersion(compareVersion, repository);

    const diff: DiffResults = await this.diffBetweenVersionsObjects(
      modelComponent,
      baseVersionObject,
      compareVersionObject,
      baseVersion,
      compareVersion,
      {}
    );

    const baseComponent = await host.get(baseCompId);
    const compareComponent = await host.get(compareCompId);

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
    { verbose, table }: { verbose?: boolean; table?: boolean } = {}
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

  async getConfigForDiffByCompObject(component: Component) {
    const depData = this.depResolver.getDependencies(component);
    const serializedToString = (dep: SerializedDependency) => {
      const idWithoutVersion = dep.__type === 'package' ? dep.id : dep.id.split('@')[0];
      return `${idWithoutVersion}@${dep.version} (${dep.lifecycle}) ${dep.source ? `(${dep.source})` : ''}`;
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
    version: string | null | undefined,
    toVersion: string | null | undefined,
    diffOpts: DiffOptions
  ): Promise<DiffResults[]> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace?.consumer;
    const components = await this.workspace.getMany(ids);
    if (!components.length) throw new BitError('failed loading the components');

    const getResults = (): Promise<DiffResults[]> => {
      if (version && toVersion) {
        return Promise.all(ids.map((id) => getComponentDiffBetweenVersions(id)));
      }
      if (version) {
        return Promise.all(components.map((component) => getComponentDiffOfVersion(component)));
      }
      return Promise.all(components.map((component) => getComponentDiff(component)));
    };
    const componentsDiffResults = await getResults();
    return componentsDiffResults;

    async function getComponentDiffOfVersion(component: Component): Promise<DiffResults> {
      if (!version) throw new Error('getComponentDiffOfVersion expects to get version');
      const consumerComponent = component.state._consumer as ConsumerComponent;
      const diffResult: DiffResults = { id: component.id, hasDiff: false };
      const modelComponent = await consumer.scope.getModelComponentIfExist(component.id);
      if (!modelComponent) {
        throw new BitError(`component ${component.id.toString()} doesn't have any version yet`);
      }
      const repository = consumer.scope.objects;
      const idList = ComponentIdList.fromArray([component.id.changeVersion(version)]);
      await consumer.scope.scopeImporter.importWithoutDeps(idList, { cache: true, reason: 'to show diff' });
      const fromVersionObject: Version = await modelComponent.loadVersion(version, repository);
      const versionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
      const fsFiles = consumerComponent.files;
      // version must be defined as the component.componentFromModel do exist
      const versionB: string = component.id.version;
      // this function gets called only when version is set
      diffResult.filesDiff = await getFilesDiff(versionFiles, fsFiles, version, versionB);
      const fromVersionComponent = await modelComponent.toConsumerComponent(version, consumer.scope.name, repository);
      await updateFieldsDiff(fromVersionComponent, consumerComponent, diffResult, diffOpts);

      return diffResult;
    }

    async function getComponentDiffBetweenVersions(id: ComponentID): Promise<DiffResults> {
      if (!version || !toVersion)
        throw new Error('getComponentDiffBetweenVersions expects to get version and toVersion');
      const diffResult: DiffResults = { id, hasDiff: false };
      const modelComponent = await consumer.scope.getModelComponentIfExist(id);
      if (!modelComponent) {
        throw new BitError(`component ${id.toString()} doesn't have any version yet`);
      }
      const repository = consumer.scope.objects;
      const idList = ComponentIdList.fromArray([id.changeVersion(version), id.changeVersion(toVersion)]);
      await consumer.scope.scopeImporter.importWithoutDeps(idList, { cache: true, reason: 'to show diff' });
      const fromVersionObject: Version = await modelComponent.loadVersion(version, repository);
      const toVersionObject: Version = await modelComponent.loadVersion(toVersion, repository);
      const fromVersionFiles = await fromVersionObject.modelFilesToSourceFiles(repository);
      const toVersionFiles = await toVersionObject.modelFilesToSourceFiles(repository);
      diffResult.filesDiff = await getFilesDiff(fromVersionFiles, toVersionFiles, version, toVersion);
      const fromVersionComponent = await modelComponent.toConsumerComponent(version, consumer.scope.name, repository);
      const toVersionComponent = await modelComponent.toConsumerComponent(toVersion, consumer.scope.name, repository);
      await updateFieldsDiff(fromVersionComponent, toVersionComponent, diffResult, diffOpts);

      return diffResult;
    }

    async function getComponentDiff(component: Component): Promise<DiffResults> {
      const diffResult: DiffResults = { id: component.id, hasDiff: false };
      const consumerComponent = component.state._consumer as ConsumerComponent;
      if (!consumerComponent.componentFromModel) {
        if (component.isDeleted()) {
          // component exists in the model but not in the filesystem, show all files as deleted
          // the reason it is loaded without componentFromModel is because it was loaded from the scope, not workspace.
          // as a proof, consumerComponent.loadedFromFileSystem is false.
          const modelFiles = consumerComponent.files;
          diffResult.filesDiff = await getFilesDiff(modelFiles, [], component.id.version, component.id.version);
          if (hasDiff(diffResult)) diffResult.hasDiff = true;
          return diffResult;
        }
        // it's a new component. not modified. show all files as new.
        const fsFiles = consumerComponent.files;
        diffResult.filesDiff = await getFilesDiff([], fsFiles, component.id.version, component.id.version);
        if (hasDiff(diffResult)) diffResult.hasDiff = true;
        return diffResult;
      }
      const modelFiles = consumerComponent.componentFromModel.files;
      const fsFiles = consumerComponent.files;
      diffResult.filesDiff = await getFilesDiff(modelFiles, fsFiles, component.id.version, component.id.version);
      await updateFieldsDiff(consumerComponent.componentFromModel, consumerComponent, diffResult, diffOpts);

      return diffResult;
    }
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
    ImporterMain
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
    graphql.register(componentCompareSchema(componentCompareMain));
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
