import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { LaneId, DEFAULT_LANE } from '@teambit/lane-id';
import { omit, uniq } from 'lodash';
// @ts-ignore
import { pipeline } from 'stream/promises';
import { Scope } from '..';
import { FETCH_OPTIONS } from '@teambit/legacy.scope-api';
import { loader } from '@teambit/legacy.loader';
import { logger } from '@teambit/legacy.logger';
import { ScopeNotFound } from '../exceptions';
import { ErrorFromRemote } from '../exceptions/error-from-remote';
import { UnexpectedNetworkError } from '../network/exceptions';
import { Repository } from '../objects';
import { ObjectItemsStream } from '../objects/object-list';
import { ObjectsWritable } from './objects-writable-stream';
import { WriteObjectsQueue } from './write-objects-queue';
import { groupByScopeName } from '../component-ops/scope-components-importer';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
import { concurrentFetchLimit } from '@teambit/harmony.modules.concurrency';
import { Remotes, Remote, ScopeNotFoundOrDenied } from '@teambit/scope.remotes';
import { Lane } from '../models';
import { ComponentsPerRemote, MultipleComponentMerger } from '../component-ops/multiple-component-merger';

/**
 * due to the use of streams, this is memory efficient and can handle easily GBs of objects.
 * this class first fetches objects from remotes and as soon as the remote returns a stream, it
 * pipes it into the Writable stream, which in turn, adds the objects into the queue, which writes
 * them into the filesystem.
 *
 * the immutable objects (such as files/versions) are processed with a high concurrency, see
 * WriteObjectsQueue. the mutable objects, such as components, are written serially mostly because
 * two remotes can bring the same component and if both components executing the "merge" operation
 * at the same time, the result is unpredictable. (see model-component-merger).
 */
export class ObjectFetcher {
  private failedScopes: { [scopeName: string]: Error } = {};
  constructor(
    private repo: Repository,
    private scope: Scope,
    private remotes: Remotes,
    private fetchOptions: Partial<FETCH_OPTIONS>,
    private ids: ComponentID[],
    private lane?: Lane,
    private context = {},
    private throwOnUnavailableScope = true,
    private groupedHashes?: { [scopeName: string]: string[] },
    private reason?: string // console the reason why the import is needed
  ) {}

  public async fetchFromRemoteAndWrite(): Promise<string[]> {
    this.fetchOptions = {
      type: 'component',
      withoutDependencies: true, // backward compatibility. not needed for remotes > 0.0.900
      includeArtifacts: false,
      allowExternal: Boolean(this.lane),
      ...this.fetchOptions,
    };
    const idsGrouped = this.groupedHashes || (this.lane ? this.groupByLanes(this.lane) : groupByScopeName(this.ids));
    const scopes = Object.keys(idsGrouped);
    logger.debug(
      `[-] Running fetch on ${scopes.length} remote(s), to get ${this.ids.length} id(s), lane: ${
        this.lane?.id() || 'n/a'
      }, reason: ${this.reason}, with the following options`,
      this.fetchOptions
    );
    const reasonStr = this.reason ? ` ${this.reason}` : '';
    const basicImportMessage = `importing ${this.getIdsMsg()}${reasonStr}`;
    loader.start(basicImportMessage);
    const objectsQueue = new WriteObjectsQueue();
    const componentsPerRemote: ComponentsPerRemote = {};
    this.showProgress(objectsQueue, basicImportMessage);
    await pMapPool(
      scopes,
      async (scopeName) => {
        const readableStream = await this.fetchFromSingleRemote(scopeName, idsGrouped[scopeName]);
        if (!readableStream) return;
        await this.writeFromSingleRemote(readableStream, scopeName, objectsQueue, componentsPerRemote);
      },
      { concurrency: concurrentFetchLimit() }
    );
    if (Object.keys(this.failedScopes).length) {
      const failedScopesErr = Object.keys(this.failedScopes).map(
        (failedScope) => `${failedScope} - ${this.failedScopes[failedScope].message}`
      );
      throw new Error(`unexpected network error has occurred during fetching scopes: ${Object.keys(
        this.failedScopes
      ).join(', ')}
server responded with the following error messages:
${failedScopesErr.join('\n')}`);
    }
    await objectsQueue.onIdle();
    logger.debug(`[-] fetchFromRemoteAndWrite, completed writing ${objectsQueue.added} objects`);
    const multipleComponentsMerger = new MultipleComponentMerger(componentsPerRemote, this.scope.sources);
    const totalComponents = multipleComponentsMerger.totalComponents();
    const imported = totalComponents ? `${totalComponents} components` : `${objectsQueue.added} objects`;
    loader.start(`successfully imported ${imported}${reasonStr}`);
    if (totalComponents) {
      await this.mergeAndPersistComponents(multipleComponentsMerger);
    }
    // even when no component has updated, we need to write the refs we got from the remote lanes
    await this.repo.writeRemoteLanes();
    logger.debug(`[-] fetchFromRemoteAndWrite, completed writing ${totalComponents} components`);

    return objectsQueue.addedHashes;
  }

  private async mergeAndPersistComponents(multipleComponentsMerger: MultipleComponentMerger) {
    const modelComponents = await multipleComponentsMerger.merge();
    await this.repo.writeObjectsToTheFS(modelComponents);

    const mergedPerRemote = modelComponents.reduce((acc, component) => {
      if (!component.remoteHead) {
        // only when a component is fetched from its origin, it has remoteHead.
        // if it's not from the origin, we don't want to add it to the remote-lanes
        return acc;
      }
      const remoteName = component.scope as string;
      if (!acc[remoteName]) acc[remoteName] = [];
      acc[remoteName].push(component);
      return acc;
    }, {} as ComponentsPerRemote);

    await Promise.all(
      Object.keys(mergedPerRemote).map(async (remoteName) => {
        await this.repo.remoteLanes.addEntriesFromModelComponents(
          LaneId.from(DEFAULT_LANE, remoteName),
          mergedPerRemote[remoteName]
        );
      })
    );
  }

  private groupByLanes(lane: Lane): { [scopeName: string]: string[] } {
    const compIds = this.fetchOptions.includeUpdateDependents
      ? lane.toComponentIdsIncludeUpdateDependents()
      : lane.toComponentIds();
    const grouped: { [scopeName: string]: string[] } = {};

    const isLaneIncludeId = (id: ComponentID, laneBitIds: ComponentIdList) => {
      if (laneBitIds.has(id)) return true;
      const foundWithoutVersion = laneBitIds.searchWithoutVersion(id);
      return foundWithoutVersion;
    };

    this.ids.forEach((id) => {
      if (isLaneIncludeId(id, compIds)) {
        (grouped[lane.scope] ||= []).push(id.toString());
      } else {
        // if not found on a lane, fetch from main.
        (grouped[id.scope] ||= []).push(id.toString());
      }
    });

    return grouped;
  }

  private async fetchFromSingleRemote(scopeName: string, ids: string[]): Promise<ObjectItemsStream | null> {
    // when importing directly from a remote scope, throw for ScopeNotFound. otherwise, when
    // fetching flattened dependencies (withoutDependencies=true), ignore this error
    const shouldThrowOnUnavailableScope = this.throwOnUnavailableScope && !this.fetchOptions.withoutDependencies;
    let remote: Remote;
    try {
      remote = await this.remotes.resolve(scopeName, this.scope);
    } catch (err: any) {
      if (err instanceof ScopeNotFoundOrDenied) {
        throw new Error(`unable to import the following component(s): ${ids.join(', ')}.
the remote scope "${scopeName}" was not found`);
      }
      throw err;
    }
    try {
      return await remote.fetch(ids, this.getFetchOptionsPerRemote(scopeName), this.context);
    } catch (err: any) {
      if (err instanceof ScopeNotFound && !shouldThrowOnUnavailableScope) {
        logger.error(`failed accessing the scope "${scopeName}". continuing without this scope.`);
      } else if (err instanceof UnexpectedNetworkError) {
        logger.error(`failed fetching from ${scopeName}`, err);
        this.failedScopes[scopeName] = err;
      } else {
        throw err;
      }
      return null;
    }
  }

  /**
   * remove the "laneId" property from the fetchOptions if the scopeName is not the lane's scope of if the lane is new.
   * otherwise, the importer will throw LaneNotFound error.
   */
  private getFetchOptionsPerRemote(scopeName: string): FETCH_OPTIONS {
    const fetchOptions = this.fetchOptions as FETCH_OPTIONS;
    if (!this.lane) return fetchOptions;
    if (scopeName === this.lane.scope && !this.lane.isNew) return fetchOptions;
    return omit(fetchOptions, ['laneId']);
  }

  private async writeFromSingleRemote(
    objectsStream: ObjectItemsStream,
    scopeName: string,
    objectsQueue: WriteObjectsQueue,
    componentsPerRemote: ComponentsPerRemote
  ) {
    const writable = new ObjectsWritable(this.repo, scopeName, objectsQueue, componentsPerRemote);
    // add an error listener for the ObjectList to differentiate between errors coming from the
    // remote and errors happening inside the Writable.
    let readableError: Error | undefined;
    objectsStream.on('error', (err) => {
      logger.error(`writeFromSingleRemote, got an error from the remote ${scopeName}`, err);
      readableError = err;
    });
    try {
      await pipeline(objectsStream, writable);
    } catch (err: any) {
      if (readableError) {
        if (!readableError.message) {
          logger.error(`error coming from a remote has no message, please fix!`, readableError);
        }
        throw new ErrorFromRemote(scopeName, readableError.message || 'unknown error');
      }
      // the error is coming from the writable, no need to treat it specially. just throw it.
      throw err;
    }
  }

  private getIdsMsg() {
    if (this.groupedHashes) {
      const total = Object.keys(this.groupedHashes).reduce((acc, key) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return acc + this.groupedHashes![key].length;
      }, 0);
      return `${total} objects`;
    }
    const uniqIds = uniq(this.ids.map((id) => id.toStringWithoutVersion()));
    if (uniqIds.length === this.ids.length) return `${this.ids.length} components`;
    return `${uniqIds.length} components, ${this.ids.length} versions`;
  }

  private showProgress(objectsQueue: WriteObjectsQueue, importMessage: string) {
    if (process.env.CI) {
      return; // don't show progress on CI.
    }
    let objectsAdded = 0;
    objectsQueue.getQueue().on('add', () => {
      objectsAdded += 1;
      if (objectsAdded % 100 === 0) {
        loader.start(`${importMessage}. downloaded ${objectsAdded} objects.`);
      }
    });
  }
}
