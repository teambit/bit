import pMapSeries from 'p-map-series';
import { Readable } from 'stream';
import { Ref, Repository } from '.';
import { Scope } from '..';
import ShowDoctorError from '../../error/show-doctor-error';
import logger from '../../logger/logger';
import { getAllVersionHashes } from '../component-ops/traverse-versions';
import { CollectObjectsOpts } from '../component-version';
import { HashMismatch } from '../exceptions';
import { Lane, ModelComponent, Version } from '../models';
import { ObjectItem } from './object-list';

export type ComponentWithCollectOptions = {
  component: ModelComponent;
  version: string;
} & CollectObjectsOpts;

export class ObjectsReadableGenerator {
  public readable: Readable;
  private pushed: string[] = [];
  constructor(private repo: Repository) {
    this.readable = new Readable({ objectMode: true, read() {} });
  }
  async pushObjectsToReadable(componentsWithOptions: ComponentWithCollectOptions[]) {
    try {
      await this.pushScopeMeta();
      await pMapSeries(componentsWithOptions, async (componentWithOptions) =>
        this.pushComponentObjects(componentWithOptions)
      );
      this.readable.push(null);
    } catch (err) {
      this.readable.destroy(err);
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
      this.readable.push(null);
    } catch (err) {
      this.readable.destroy(err);
    }
  }

  async pushObjects(refs: Ref[], scope: Scope) {
    try {
      await pMapSeries(refs, async (ref) => {
        const objectItem = await scope.getObjectItem(ref);
        this.push(objectItem);
      });
      this.readable.push(null);
    } catch (err) {
      this.readable.destroy(err);
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
    const { component, collectParents, collectArtifacts, collectParentsUntil } = componentWithOptions;
    const version = await component.loadVersion(componentWithOptions.version, this.repo, false);
    if (!version)
      throw new ShowDoctorError(`failed loading version ${componentWithOptions.version} of ${component.id()}`);
    if (collectParentsUntil && version.hash().isEqual(collectParentsUntil)) {
      return;
    }
    const collectVersionObjects = async (ver: Version): Promise<ObjectItem[]> => {
      const versionRefs = ver.refsWithOptions(collectParents, collectArtifacts);
      const versionObjects = await ver.collectManyObjects(this.repo, versionRefs);
      const versionData = { ref: ver.hash(), buffer: await ver.asRaw(this.repo), type: ver.getType() };
      return [...versionObjects, versionData];
    };
    try {
      const componentData = {
        ref: component.hash(),
        buffer: await component.asRaw(this.repo),
        type: component.getType(),
      };
      if (collectParents) {
        const parentsObjects: ObjectItem[] = [];
        const allParentsHashes = await getAllVersionHashes(
          component,
          this.repo,
          true,
          version.hash(),
          collectParentsUntil
        );
        const missingParentsHashes = allParentsHashes.filter((h) => !h.isEqual(version.hash()));
        await Promise.all(
          missingParentsHashes.map(async (parentHash) => {
            const parentVersion = (await parentHash.load(this.repo)) as Version;
            const parentsObj = await collectVersionObjects(parentVersion);
            parentsObjects.push(...parentsObj);
          })
        );
        this.pushManyObjects(parentsObjects);
      }
      const versionObjects = await collectVersionObjects(version);
      this.pushManyObjects(versionObjects);
      this.push(componentData);
    } catch (err) {
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
