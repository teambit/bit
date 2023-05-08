import pMapSeries from 'p-map-series';
import { Readable } from 'stream';
import { Ref, Repository } from '.';
import { Scope } from '..';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { getAllVersionHashesMemoized } from '../component-ops/traverse-versions';
import { HashMismatch } from '../exceptions';
import { Lane, ModelComponent, Version } from '../models';
import { ObjectItem } from './object-list';

export type ComponentWithCollectOptions = {
  component: ModelComponent;
  version: string;
  collectParents: boolean;
  collectParentsUntil?: Ref | null; // stop traversing when this hash found. helps to import only the delta.
  collectArtifacts: boolean;
  includeVersionHistory?: boolean; // send VersionHistory object if exists rather than collecting parents
};

export class ObjectsReadableGenerator {
  public readable: Readable;
  private pushed: string[] = [];
  constructor(private repo: Repository, private callbackOnceDone: Function) {
    this.readable = new Readable({ objectMode: true, read() {} });
  }
  async pushObjectsToReadable(componentsWithOptions: ComponentWithCollectOptions[]) {
    try {
      await this.pushScopeMeta();
      await pMapSeries(componentsWithOptions, async (componentWithOptions) =>
        this.pushComponentObjects(componentWithOptions)
      );
      this.closeReadableSuccessfully();
    } catch (err: any) {
      this.closeReadableFailure(err);
    }
  }

  async pushLanes(lanesToFetch: Lane[]) {
    try {
      await Promise.all(
        lanesToFetch.map(async (laneToFetch) => {
          const laneBuffer = await laneToFetch.compress();
          this.push({ ref: laneToFetch.hash(), buffer: laneBuffer });
        })
      );
      this.closeReadableSuccessfully();
    } catch (err: any) {
      this.closeReadableFailure(err);
    }
  }

  async pushObjects(refs: Ref[], scope: Scope) {
    try {
      await pMapSeries(refs, async (ref) => {
        const objectItem = await this.getObjectGracefully(ref, scope);
        if (objectItem) this.push(objectItem);
      });
      this.closeReadableSuccessfully();
    } catch (err: any) {
      this.closeReadableFailure(err);
    }
  }

  private closeReadableSuccessfully() {
    logger.debug(`ObjectsReadableGenerator, pushed ${this.pushed.length} objects`);
    this.callbackOnceDone();
    this.readable.push(null);
  }

  private closeReadableFailure(err: Error) {
    logger.debug(`ObjectsReadableGenerator, pushed ${this.pushed.length} objects`);
    logger.error(`ObjectsReadableGenerator, got an error`, err);
    this.callbackOnceDone(err);
    this.readable.destroy(err);
  }

  private async getObjectGracefully(ref: Ref, scope: Scope) {
    try {
      return await scope.getObjectItem(ref);
    } catch (err: any) {
      logger.warn(
        `getObjectGracefully: failed retrieving an object ${ref.toString()} from the filesystem.\n${err.message}`
      );
      return null;
    }
  }

  private async pushScopeMeta() {
    const scopeMeta = await this.repo.getScopeMetaObject();
    this.push(scopeMeta);
  }

  private push(obj: ObjectItem) {
    const hashStr = obj.ref.toString();
    if (this.pushed.includes(hashStr)) {
      return;
    }
    logger.trace('ObjectsReadableGenerator.push', hashStr);
    this.readable.push(obj);
    this.pushed.push(hashStr);
  }
  private pushManyObjects(objects: ObjectItem[]) {
    objects.map((obj) => this.push(obj));
  }

  private async pushComponentObjects(componentWithOptions: ComponentWithCollectOptions): Promise<void> {
    const { component, collectParents, collectArtifacts, collectParentsUntil, includeVersionHistory } =
      componentWithOptions;
    const version = await component.loadVersion(componentWithOptions.version, this.repo, false);
    if (!version)
      throw new ShowDoctorError(`failed loading version ${componentWithOptions.version} of ${component.id()}`);
    if (collectParentsUntil && version.hash().isEqual(collectParentsUntil)) {
      return;
    }
    const collectVersionObjects = async (ver: Version): Promise<ObjectItem[]> => {
      const versionRefs = ver.refsWithOptions(false, collectArtifacts);
      const missingVersionRefs = versionRefs.filter((ref) => !this.pushed.includes(ref.toString()));
      const versionObjects = await ver.collectManyObjects(this.repo, missingVersionRefs);
      const versionData = { ref: ver.hash(), buffer: await ver.asRaw(this.repo), type: ver.getType() };
      return [...versionObjects, versionData];
    };
    try {
      if (!this.pushed.includes(component.hash().toString())) {
        const componentData = {
          ref: component.hash(),
          buffer: await component.asRaw(this.repo),
          type: component.getType(),
        };
        this.push(componentData);
      }
      const allVersions: Version[] = [];
      if (includeVersionHistory) {
        const versionHistory = await component.getAndPopulateVersionHistory(this.repo, version.hash());
        const versionHistoryData = {
          ref: versionHistory.hash(),
          buffer: await versionHistory.asRaw(this.repo),
          type: versionHistory.getType(),
        };
        this.push(versionHistoryData);
      }
      if (collectParents) {
        const allParentsHashes = await getAllVersionHashesMemoized({
          modelComponent: component,
          repo: this.repo,
          startFrom: version.hash(),
          stopAt: collectParentsUntil ? [collectParentsUntil] : undefined,
        });
        const missingParentsHashes = allParentsHashes.filter((h) => !h.isEqual(version.hash()));
        const parentVersions = await pMapSeries(missingParentsHashes, (parentHash) => parentHash.load(this.repo));
        allVersions.push(...(parentVersions as Version[]));
        // note: don't bring the head. otherwise, component-delta of the head won't bring all history of this comp.
      }
      allVersions.push(version);
      await pMapSeries(allVersions, async (ver) => {
        const versionObjects = await collectVersionObjects(ver);
        this.pushManyObjects(versionObjects);
      });
    } catch (err: any) {
      logger.error(`component-version.toObjects ${componentWithOptions.component.id()} got an error`, err);
      // @ts-ignore
      const originalVersionHash = component.getRef(componentWithOptions.version).toString();
      const currentVersionHash = version.hash().toString();
      if (originalVersionHash !== currentVersionHash) {
        throw new HashMismatch(component.id(), componentWithOptions.version, originalVersionHash, currentVersionHash);
      }
      throw err;
    }
  }
}
