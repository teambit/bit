import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { ScopeMain, ScopeAspect } from '@teambit/scope';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import componentsDiff, {
  diffBetweenVersionsObjects,
  DiffResults,
  FieldsDiff,
  FileDiff,
} from '@teambit/legacy/dist/consumer/component-ops/components-diff';
import ComponentAspect, { ComponentMain } from '@teambit/component';
import { componentCompareSchema } from './component-compare.graphql';
import { ComponentCompareAspect } from './component-compare.aspect';
import { DiffCmd } from './diff-cmd';

export type ComponentCompareResult = {
  id: string;
  code: FileDiff[];
  fields: FieldsDiff[];
};

export class ComponentCompareMain {
  constructor(
    private componentAspect: ComponentMain,
    private scope: ScopeMain,
    private logger: Logger,
    private workspace?: Workspace
  ) {}

  async compare(baseIdStr: string, compareIdStr: string): Promise<ComponentCompareResult> {
    const host = this.componentAspect.getHost();
    this.componentAspect.getHost();
    const [baseCompId, compareCompId] = await host.resolveMultipleComponentIds([baseIdStr, compareIdStr]);
    const modelComponent = await this.scope.legacyScope.getModelComponentIfExist(compareCompId._legacy);

    if (!modelComponent) {
      throw new GeneralError(`component ${compareCompId.toString()} doesn't have any version yet`);
    }

    const baseVersion = baseCompId.version as string;
    const compareVersion = compareCompId.version as string;

    const repository = this.scope.legacyScope.objects;
    const baseVersionObject = await modelComponent.loadVersion(baseVersion, repository);
    const compareVersionObject = await modelComponent.loadVersion(compareVersion, repository);

    const diff: DiffResults = await diffBetweenVersionsObjects(
      modelComponent,
      baseVersionObject,
      compareVersionObject,
      baseVersion,
      compareVersion,
      this.scope.legacyScope,
      {}
    );

    const compareResult = {
      id: `${baseCompId}-${compareCompId}`,
      code: diff.filesDiff || [],
      fields: diff.fieldsDiff || [],
    };

    return compareResult;
  }

  async diffByCLIValues(values: string[], verbose: boolean, table: boolean): Promise<any> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    const { bitIds, version, toVersion } = await this.parseValues(values);
    if (!bitIds || !bitIds.length) {
      throw new BitError('there are no modified components to diff');
    }
    const diffResults = await componentsDiff(consumer, bitIds, version, toVersion, {
      verbose,
      formatDepsAsTable: table,
    });
    await consumer.onDestroy();
    return diffResults;
  }

  private async parseValues(values: string[]): Promise<{ bitIds: BitId[]; version?: string; toVersion?: string }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    // option #1: bit diff
    // no arguments
    if (!values.length) {
      const componentsList = new ComponentsList(consumer);
      const bitIds = await componentsList.listModifiedComponents();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return { bitIds };
    }
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const oneBeforeLastValue = values[values.length - 2];
    const isLastItemVersion = BitId.isValidVersion(lastValue);
    const isOneBeforeLastItemVersion = BitId.isValidVersion(oneBeforeLastValue);
    // option #2: bit diff [ids...]
    // all arguments are ids
    if (!isLastItemVersion) {
      return { bitIds: this.getBitIdsForDiff(values) };
    }
    // option #3: bit diff [id] [version]
    // last argument is a version, first argument is id
    if (!isOneBeforeLastItemVersion) {
      if (values.length !== 2) {
        throw new BitError(
          `bit diff [id] [version] syntax was used, however, ${values.length} arguments were given instead of 2`
        );
      }
      return { bitIds: this.getBitIdsForDiff([firstValue]), version: lastValue };
    }
    // option #4: bit diff [id] [version] [to_version]
    // last argument and one before the last are versions, first argument is id
    if (values.length !== 3) {
      throw new BitError(
        `bit diff [id] [version] [to_version] syntax was used, however, ${values.length} arguments were given instead of 3`
      );
    }
    return { bitIds: this.getBitIdsForDiff([firstValue]), version: oneBeforeLastValue, toVersion: lastValue };
  }

  private getBitIdsForDiff(ids: string[]): BitId[] {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    if (hasWildcard(ids)) {
      const componentsList = new ComponentsList(consumer);
      return componentsList.listComponentsByIdsWithWildcard(ids);
    }
    return ids.map((id) => consumer.getParsedId(id));
  }

  static slots = [];
  static dependencies = [GraphqlAspect, ComponentAspect, ScopeAspect, LoggerAspect, CLIAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([graphql, component, scope, loggerMain, cli, workspace]: [
    GraphqlMain,
    ComponentMain,
    ScopeMain,
    LoggerMain,
    CLIMain,
    Workspace
  ]) {
    const logger = loggerMain.createLogger(ComponentCompareAspect.id);
    const componentCompareMain = new ComponentCompareMain(component, scope, logger, workspace);
    cli.register(new DiffCmd(componentCompareMain));
    graphql.register(componentCompareSchema(componentCompareMain));
    return componentCompareMain;
  }
}

ComponentCompareAspect.addRuntime(ComponentCompareMain);

export default ComponentCompareMain;
