import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { BitId } from '@teambit/legacy/dist/bit-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import ComponentsList from '@teambit/legacy/dist/consumer/component/components-list';
import { LanesIsDisabled } from '@teambit/legacy/dist/consumer/lanes/exceptions/lanes-is-disabled';
import {
  ApplyVersionResults,
  MergeStrategy,
  mergeVersion,
} from '@teambit/legacy/dist/consumer/versions-ops/merge-version';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import hasWildcard from '@teambit/legacy/dist/utils/string/has-wildcard';
import { MergeCmd } from './merge-cmd';
import { MergingAspect } from './merging.aspect';
import { abortMerge, mergeComponentsFromRemote, resolveMerge } from './merge-snaps';

export class MergingMain {
  constructor(private workspace: Workspace) {}

  async merge(
    values: string[],
    mergeStrategy: MergeStrategy,
    abort: boolean,
    resolve: boolean,
    noSnap: boolean,
    message: string,
    build: boolean
  ): Promise<ApplyVersionResults> {
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer: Consumer = this.workspace.consumer;
    if (consumer.isLegacy && (noSnap || message || abort || resolve)) {
      throw new LanesIsDisabled();
    }
    let mergeResults;
    const firstValue = R.head(values);
    if (resolve) {
      mergeResults = await resolveMerge(consumer, values, message, build);
    } else if (abort) {
      mergeResults = await abortMerge(consumer, values);
    } else if (!BitId.isValidVersion(firstValue)) {
      const bitIds = this.getComponentsToMerge(consumer, values);
      // @todo: version could be the lane only or remote/lane
      mergeResults = await mergeComponentsFromRemote(consumer, bitIds, mergeStrategy, noSnap, message, build);
    } else {
      const version = firstValue;
      const ids = R.tail(values);
      const bitIds = this.getComponentsToMerge(consumer, ids);
      mergeResults = await mergeVersion(consumer, version, bitIds, mergeStrategy);
    }
    await consumer.onDestroy();
    return mergeResults;
  }

  private getComponentsToMerge(consumer: Consumer, ids: string[]): BitId[] {
    if (hasWildcard(ids)) {
      const componentsList = new ComponentsList(consumer);
      return componentsList.listComponentsByIdsWithWildcard(ids);
    }
    return ids.map((id) => consumer.getParsedId(id));
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    const merging = new MergingMain(workspace);
    cli.register(new MergeCmd(merging));
    return merging;
  }
}

MergingAspect.addRuntime(MergingMain);
