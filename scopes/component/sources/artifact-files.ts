import fs from 'fs-extra';
import path from 'path';
import type { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { logger } from '@teambit/legacy.logger';
import type { Lane, Repository, Source } from '@teambit/objects';
import { Ref } from '@teambit/objects';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { ArtifactVinyl } from './artifact';
import { compact } from 'lodash';

/**
 * the part of legacy-scope's Scope used to import missing artifacts.
 * restated rather than imported because legacy-scope depends on this component.
 */
export type ArtifactsScope = {
  objects: Repository;
  scopeImporter: {
    importManyObjects(groupedHashes: { [scopeName: string]: string[] }, reason?: string): Promise<void>;
  };
  getCurrentLaneObject(): Promise<Lane | undefined>;
  isIdOnLane(id: ComponentID, lane?: Lane | null): Promise<boolean | null>;
};

/**
 * the extensions lookup used to find build artifacts, from legacy extension-data's ExtensionDataList.
 * restated rather than imported because extension-data depends on this component.
 */
export type ArtifactsExtensions = {
  findExtension(extensionId: string): { data: { [key: string]: any } } | undefined;
};

export type ArtifactRef = { relativePath: string; ref: Ref; url?: string };
export type ArtifactModel = { relativePath: string; file: string; url?: string };
export type ArtifactSource = { relativePath: string; source: Source; url?: string };
export type ArtifactObject = {
  name: string;
  description?: string;
  generatedBy: string;
  storage: string;
  task: {
    id: string; // aspect-id
    name?: string;
  };
  files: ArtifactFiles;
};
type ArtifactFilesObject = {
  paths?: string[];
  vinyls?: ArtifactVinyl[];
  refs?: ArtifactRef[];
};

/**
 * Artifacts utilize lazy loading mechanism. As such, when loading them from the objects, they are
 * not converted to ArtifactVinyl[]. Instead, they are loaded as ArtifactRef[].
 * Later, when they're needed, the `getVinylsAndImportIfMissing` method is used to load them and if
 * needed, to import them from a remote.
 *
 * the workflow of an artifact during the tag is as follows:
 * 1. First, it got created on a capsule and saved to the ConsumerComponent as ArtifactVinyl.
 * 2. On tag, it is transformed to ArtifactSource in order to save the Sources (BitObjects) in the objects.
 * 3. Finally, once the Version object is saved, it needs to save only the hash of the artifacts, hence ArtifactModel.
 */
export class ArtifactFiles {
  constructor(
    public paths: string[] = [],
    public vinyls: ArtifactVinyl[] = [],
    public refs: ArtifactRef[] = []
  ) {}

  clone() {
    const vinyls = this.vinyls.map((vinyl) => vinyl.clone());
    const refs = this.refs.map((ref) => ({ ...ref }));
    return new ArtifactFiles({ ...this.paths }, vinyls, refs);
  }

  populateRefsFromSources(sources: ArtifactSource[]) {
    this.refs = sources.map((source) => ({
      relativePath: source.relativePath,
      ref: source.source.hash(),
      url: source.url,
    }));
  }

  populateVinylsFromPaths(rootDir: string) {
    const existingPaths: string[] = [];
    this.vinyls = this.paths.reduce((acc: ArtifactVinyl[], file) => {
      const fullPath = path.join(rootDir, file);
      if (fs.existsSync(fullPath)) {
        existingPaths.push(file);
        acc.push(new ArtifactVinyl({ path: file, contents: fs.readFileSync(fullPath) }));
      } else {
        logger.debug(
          `populateVinylsFromPaths: file "${fullPath}" not found, skipping. (may have been removed by a later build task)`
        );
      }
      return acc;
    }, []);
    this.paths = existingPaths;
  }

  getExistingVinyls() {
    return this.vinyls;
  }

  isEmpty() {
    return !this.vinyls.length && !this.refs.length && !this.paths.length;
  }

  static fromModel(artifactModels: ArtifactModel[] = []) {
    const refs: ArtifactRef[] = artifactModels.map((artifactModel) => ({
      relativePath: artifactModel.relativePath,
      ref: Ref.from(artifactModel.file),
      url: artifactModel.url,
    }));
    return new ArtifactFiles([], [], refs);
  }

  static fromObject(obj: ArtifactFilesObject) {
    const refs = obj.refs?.map((ref) => {
      const artifactRef: ArtifactRef = {
        relativePath: ref.relativePath,
        url: ref.url,
        ref: new Ref(ref.ref.hash),
      };
      return artifactRef;
    });
    return new ArtifactFiles(obj.paths, obj.vinyls, refs);
  }

  static fromVinylsToSources(vinyls: ArtifactVinyl[]): ArtifactSource[] {
    return vinyls.map((artifact) => {
      return {
        relativePath: pathNormalizeToLinux(artifact.relative),
        source: artifact.toSourceAsLinuxEOL(),
        url: artifact.url,
      };
    });
  }

  async getVinylsAndImportIfMissing(id: ComponentID, scope: ArtifactsScope): Promise<ArtifactVinyl[]> {
    if (this.isEmpty()) return [];
    if (this.vinyls.length) return this.vinyls;
    const allHashes = this.refs.map((artifact) => artifact.ref);
    // const missingWithNulls = await Promise.all(allHashes.map((hash) => scope.objects.maybeGet(hash)));

    const missingWithNull = await Promise.all(
      allHashes.map(async (hash) => (!(await scope.objects.has(hash)) ? hash : null))
    );

    const missing = compact(missingWithNull);
    if (missing.length) await this.importMissing(id, scope, missing);
    const getOneArtifact = async (artifact: ArtifactRef) => {
      const content = (await artifact.ref.load(scope.objects)) as Source;
      if (!content) throw new BitError(`failed loading file ${artifact.relativePath} from the model`);
      return new ArtifactVinyl({
        base: '.',
        path: artifact.relativePath,
        contents: content.contents,
        url: artifact.url,
      });
    };
    this.vinyls = await Promise.all(this.refs.map((artifact) => getOneArtifact(artifact)));
    return this.vinyls;
  }

  private async importMissing(id: ComponentID, scope: ArtifactsScope, missingRefs: Ref[]) {
    const allHashes = missingRefs.map((ref) => ref.hash);
    const scopeComponentsImporter = scope.scopeImporter;
    const lane = await scope.getCurrentLaneObject();
    const unmergedEntry = scope.objects.unmergedComponents.getEntry(id);
    let errorFromUnmergedLaneScope: Error | undefined;
    if (unmergedEntry?.laneId) {
      try {
        logger.debug(
          `getVinylsAndImportIfMissing, trying to get artifacts for ${id.toString()} from unmerged-lane-id: ${unmergedEntry.laneId.toString()}`
        );
        await scopeComponentsImporter.importManyObjects(
          { [unmergedEntry.laneId.scope]: allHashes },
          `to get artifacts for ${id.toString()} from unmerged-lane: ${unmergedEntry.laneId.toString()}`
        );
      } catch (err: any) {
        logger.debug(
          `getVinylsAndImportIfMissing, unable to get artifacts for ${id.toString()} from ${unmergedEntry.laneId.toString()}`
        );
        errorFromUnmergedLaneScope = err;
      }
    }
    const isIdOnLane = await scope.isIdOnLane(id, lane);
    const scopeName = isIdOnLane ? (lane?.scope as string) : id.scope;
    try {
      await scopeComponentsImporter.importManyObjects(
        { [scopeName]: allHashes },
        `to get artifacts for ${id.toString()} from ${scopeName}`
      );
    } catch (err) {
      if (!unmergedEntry || errorFromUnmergedLaneScope) {
        logger.error('failed fetching the following hashes', { id, isIdOnLane, scopeName, allHashes });
        throw err;
      }
      // unmergedEntry is set, and it was able to fetch from the unmerged-lane-id scope. all is good.
    }
  }
}

export function refsToModelObjects(refs: ArtifactRef[]): ArtifactModel[] {
  return refs.map((artifact) => {
    return {
      relativePath: artifact.relativePath,
      file: artifact.ref.hash,
      url: artifact.url,
    };
  });
}

export function getRefsFromExtensions(extensions: ArtifactsExtensions): Ref[] {
  const artifactsFiles = getArtifactsFiles(extensions);
  const refs = artifactsFiles.map((artifactFiles) => artifactFiles.refs.map((r) => r.ref));
  return refs.flat().filter((ref) => ref);
}

export function getArtifactFilesByExtension(extensions: ArtifactsExtensions, extensionName: string): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts.filter((artifact) => artifact.task.id === extensionName).map((artifact) => artifact.files);
}

export function getArtifactFilesExcludeExtension(
  extensions: ArtifactsExtensions,
  extensionNameToExclude: string
): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts
    .filter((artifact) => artifact.task.id !== extensionNameToExclude)
    .map((artifact) => artifact.files);
}

export function convertBuildArtifactsToModelObject(extensions: ArtifactsExtensions) {
  const buildArtifacts = getBuildArtifacts(extensions);
  buildArtifacts.forEach((artifact) => {
    // @ts-ignore
    artifact.files = refsToModelObjects(artifact.files.refs);
  });
}

export function convertBuildArtifactsFromModelObject(extensions: ArtifactsExtensions) {
  const artifactObjects = getBuildArtifacts(extensions);
  artifactObjects.forEach((artifactObject) => {
    // @ts-ignore
    artifactObject.files = ArtifactFiles.fromModel(artifactObject.files);
  });
}

export function getArtifactsFiles(extensions: ArtifactsExtensions): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts.map((artifacts) => artifacts.files);
}

export function reStructureBuildArtifacts(extensions: ArtifactsExtensions) {
  const buildArtifacts = getBuildArtifacts(extensions);
  buildArtifacts.forEach((artifacts) => {
    artifacts.files = deserializeArtifactFiles(artifacts.files);
  });
}

export function deserializeArtifactFiles(obj: { paths: string[]; vinyls: ArtifactVinyl[]; refs: ArtifactRef[] }) {
  const refs = obj.refs.map((ref) => ({
    relativePath: ref.relativePath,
    ref: new Ref(ref.ref.hash),
    url: ref.url,
  }));
  return new ArtifactFiles(obj.paths, obj.vinyls, refs);
}

function getBuildArtifacts(extensions: ArtifactsExtensions): ArtifactObject[] {
  return extensions.findExtension('teambit.pipelines/builder')?.data?.artifacts || [];
}
