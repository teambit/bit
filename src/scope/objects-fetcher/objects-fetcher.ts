import { BitId } from '@teambit/legacy-bit-id';
import { pipeline } from 'stream';
import { promisify } from 'util';
import pMap from 'p-map';
import { Scope } from '..';
import { FETCH_OPTIONS } from '../../api/scope/lib/fetch';
import loader from '../../cli/loader';
import logger from '../../logger/logger';
import { Remote, Remotes } from '../../remotes';
import { ScopeNotFound } from '../exceptions';
import { ErrorFromRemote } from '../exceptions/error-from-remote';
import { UnexpectedNetworkError } from '../network/exceptions';
import { Repository } from '../objects';
import { ObjectItemsStream } from '../objects/object-list';
import { ObjectsWritable } from './objects-writable-stream';
import { WriteComponentsQueue } from './write-components-queue';
import { WriteObjectsQueue } from './write-objects-queue';
import { groupByLanes, groupByScopeName } from '../component-ops/scope-components-importer';
import { concurrentFetchLimit } from '../../utils/concurrency';
import { ScopeNotFoundOrDenied } from '../../remotes/exceptions/scope-not-found-or-denied';
import { Lane } from '../models';

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
    private ids: BitId[],
    private lanes: Lane[] = [],
    private context = {},
    private throwOnUnavailableScope = true
  ) {}

  public async fetchFromRemoteAndWrite() {
    this.fetchOptions = {
      type: 'component',
      withoutDependencies: true,
      includeArtifacts: false,
      allowExternal: Boolean(this.lanes.length),
      ...this.fetchOptions,
    };
    const idsGrouped = this.lanes.length ? groupByLanes(this.ids, this.lanes) : groupByScopeName(this.ids);
    const scopes = Object.keys(idsGrouped);
    logger.debug(
      `[-] Running fetch on ${scopes.length} remote(s), to get ${this.ids.length} id(s), with the following options`,
      this.fetchOptions
    );
    const objectsQueue = new WriteObjectsQueue();
    const componentsQueue = new WriteComponentsQueue();
    this.showProgress(objectsQueue, componentsQueue);
    await pMap(
      scopes,
      async (scopeName) => {
        const readableStream = await this.fetchFromSingleRemote(scopeName, idsGrouped[scopeName]);
        if (!readableStream) return;
        await this.writeFromSingleRemote(readableStream, scopeName, objectsQueue, componentsQueue);
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
    await Promise.all([objectsQueue.onIdle(), componentsQueue.onIdle()]);
    logger.debug(`[-] fetchFromRemoteAndWrite, completed writing ${objectsQueue.added} objects`);
    loader.start('all objects were processed and written to the filesystem successfully');
    await this.repo.writeRemoteLanes();
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
      return await remote.fetch(ids, this.fetchOptions as FETCH_OPTIONS, this.context);
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

  private async writeFromSingleRemote(
    objectsStream: ObjectItemsStream,
    scopeName: string,
    objectsQueue: WriteObjectsQueue,
    componentsQueue: WriteComponentsQueue
  ) {
    const writable = new ObjectsWritable(this.repo, this.scope.sources, scopeName, objectsQueue, componentsQueue);
    const pipelinePromise = promisify(pipeline);
    // add an error listener for the ObjectList to differentiate between errors coming from the
    // remote and errors happening inside the Writable.
    let readableError: Error | undefined;
    objectsStream.on('error', (err) => {
      readableError = err;
    });
    try {
      await pipelinePromise(objectsStream, writable);
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

  private showProgress(objectsQueue: WriteObjectsQueue, componentsQueue: WriteComponentsQueue) {
    let objectsAdded = 0;
    let objectsCompleted = 0;
    let componentsAdded = 0;
    let componentsCompleted = 0;
    objectsQueue.getQueue().on('add', () => {
      objectsAdded += 1;
      if (objectsAdded % 100 === 0) {
        loader.start(
          `Downloaded ${objectsAdded} objects, ${componentsAdded} components. Processed successfully ${objectsCompleted} objects, ${componentsCompleted} components`
        );
      }
    });
    objectsQueue.getQueue().on('next', () => {
      objectsCompleted += 1;
      if (objectsAdded % 100 === 0) {
        loader.start(
          `Downloaded ${objectsAdded} objects, ${componentsAdded} components. Processed successfully ${objectsCompleted} objects, ${componentsCompleted} components`
        );
      }
    });
    componentsQueue.getQueue().on('add', () => {
      componentsAdded += 1;
    });
    componentsQueue.getQueue().on('next', () => {
      componentsCompleted += 1;
    });
  }
}
