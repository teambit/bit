import fs from 'fs-extra';
import { filter } from 'bluebird';
import path from 'path';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import logger from '@teambit/legacy/dist/logger/logger';
import { Scope } from '@teambit/legacy/dist/scope';
import { Lane, Source } from '@teambit/legacy/dist/scope/models';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { ArtifactVinyl } from './artifact';
import { MissingObjects } from '@teambit/legacy/dist/scope/exceptions/missing-objects';

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
    this.vinyls = this.paths.map(
      (file) => new ArtifactVinyl({ path: file, contents: fs.readFileSync(path.join(rootDir, file)) })
    );
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

  async getVinylsAndImportIfMissing(id: ComponentID, scope: Scope): Promise<ArtifactVinyl[]> {
    if (this.isEmpty()) return [];
    if (this.vinyls.length) return this.vinyls;
    const allHashes = this.refs.map((artifact) => artifact.ref);
    const missing = await filter(allHashes, async (hash) => !(await scope.objects.has(hash)));
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

  private async importMissing(id: ComponentID, scope: Scope, missingRefs: Ref[]) {
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

export async function importMultipleDistsArtifacts(scope: Scope, components: Component[]) {
  logger.debug(
    `importMultipleDistsArtifacts: ${components.length} components: ${components
      .map((c) => c.id.toString())
      .join(', ')}`
  );
  const extensionsNamesForDistArtifacts = 'teambit.compilation/compiler';
  const lane = await scope.getCurrentLaneObject();
  const scopeComponentsImporter = scope.scopeImporter;
  const groupedHashes: { [scopeName: string]: string[] } = {};
  const debugHashesOrigin = {};
  await Promise.all(
    components.map(async (component) => {
      const artifactsFiles = getArtifactFilesByExtension(component.extensions, extensionsNamesForDistArtifacts);
      const isIdOnLane = await scope.isIdOnLane(component.id, lane, false);
      const getScopes = () => {
        if (isIdOnLane === null) {
          // we're not sure wether it's on the lane or not. try to fetch from both.
          return [lane?.scope as string, component.scope as string];
        }
        return isIdOnLane ? [lane?.scope as string] : [component.scope as string];
      };
      const scopes = getScopes();
      artifactsFiles.forEach((artifactFiles) => {
        if (!artifactFiles) return;
        if (!(artifactFiles instanceof ArtifactFiles)) {
          artifactFiles = deserializeArtifactFiles(artifactFiles);
        }
        if (artifactFiles.isEmpty()) return;
        if (artifactFiles.vinyls.length) return;
        const allHashes = artifactFiles.refs.map((artifact) => artifact.ref.hash);
        scopes.forEach((scopeName) => (groupedHashes[scopeName] ||= []).push(...allHashes));
        allHashes.forEach(
          (hash) => (debugHashesOrigin[hash] = `id: ${component.id.toString()}. isIdOnLane: ${isIdOnLane}`)
        );
      });
    })
  );
  try {
    await scopeComponentsImporter.importManyObjects(
      groupedHashes,
      `to get dists artifacts for ${components.length} components`
    );
  } catch (err) {
    logger.error('failed fetching the following hashes', { groupedHashes, debugHashesOrigin });
    throw err;
  }
  logger.debug(`importMultipleDistsArtifacts: ${components.length} components. completed successfully`);
}

export async function importAllArtifactsFromLane(scope: Scope, components: Component[], lane: Lane) {
  logger.debug(
    `importAllArtifactsFromLane: ${components.length} components: ${components.map((c) => c.id.toString()).join(', ')}`
  );
  const scopeComponentsImporter = scope.scopeImporter;
  const groupedHashesOnLane: { [scopeName: string]: string[] } = {};
  const groupedHashesFromMain: { [scopeName: string]: string[] } = {};
  const debugHashesOrigin = {};
  groupedHashesOnLane[lane.scope] = [];
  components.forEach((component) => {
    const artifactsRefs = getRefsFromExtensions(component.extensions);
    const artifactsRefsStr = artifactsRefs.map((ref) => ref.hash);
    groupedHashesOnLane[lane.scope].push(...artifactsRefsStr);
    if (lane.scope !== component.scope) {
      (groupedHashesFromMain[component.scope as string] ||= []).push(...artifactsRefsStr);
    }
    artifactsRefsStr.forEach(
      (hash) => (debugHashesOrigin[hash] = `id: ${component.id.toString()}. will try both lane and main`)
    );
  });
  let errorFromLane: MissingObjects | undefined;
  try {
    await scopeComponentsImporter.importManyObjects(
      groupedHashesOnLane,
      `to get all artifacts for ${components.length} components from lane ${lane.id()}`
    );
  } catch (err: any) {
    logger.error('failed fetching the following hashes from the lane', {
      groupedHashes: groupedHashesOnLane,
      debugHashesOrigin,
    });
    if (err instanceof MissingObjects) {
      errorFromLane = err;
    } else throw err;
  }

  if (errorFromLane) {
    if (!Object.keys(groupedHashesFromMain).length) throw errorFromLane;
    const groupHashesFallBack: { [scopeName: string]: string[] } = {};
    const missing = errorFromLane.hashesPerRemotes;
    Object.keys(groupedHashesFromMain).forEach((scopeName) => {
      groupHashesFallBack[scopeName] = groupedHashesFromMain[scopeName].filter((hash) => missing[hash]);
    });
    try {
      await scopeComponentsImporter.importManyObjects(
        groupHashesFallBack,
        `to get all artifacts for ${components.length} components from main`
      );
    } catch (err: any) {
      logger.error('failed fetching the following hashes from both lane and main', {
        groupedHashes: groupedHashesOnLane,
        debugHashesOrigin,
      });
      if (err instanceof MissingObjects) {
        const currentMissing = err.hashesPerRemotes;
        const hashesPerRemotes = Object.keys(currentMissing).reduce((acc, curr) => {
          acc[curr] = [...missing[curr], ...currentMissing[curr]];
          return acc;
        }, {});
        throw new MissingObjects(hashesPerRemotes);
      }
      throw err;
    }
  }

  logger.debug(`importAllArtifactsFromLane: ${components.length} components. completed successfully`);
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

export function getRefsFromExtensions(extensions: ExtensionDataList): Ref[] {
  const artifactsFiles = getArtifactsFiles(extensions);
  const refs = artifactsFiles.map((artifactFiles) => artifactFiles.refs.map((r) => r.ref));
  return refs.flat().filter((ref) => ref);
}

export function getArtifactFilesByExtension(extensions: ExtensionDataList, extensionName: string): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts.filter((artifact) => artifact.task.id === extensionName).map((artifact) => artifact.files);
}

export function getArtifactFilesExcludeExtension(
  extensions: ExtensionDataList,
  extensionNameToExclude: string
): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts
    .filter((artifact) => artifact.task.id !== extensionNameToExclude)
    .map((artifact) => artifact.files);
}

export function convertBuildArtifactsToModelObject(extensions: ExtensionDataList) {
  const buildArtifacts = getBuildArtifacts(extensions);
  buildArtifacts.forEach((artifact) => {
    // @ts-ignore
    artifact.files = refsToModelObjects(artifact.files.refs);
  });
}

export function convertBuildArtifactsFromModelObject(extensions: ExtensionDataList) {
  const artifactObjects = getBuildArtifacts(extensions);
  artifactObjects.forEach((artifactObject) => {
    // @ts-ignore
    artifactObject.files = ArtifactFiles.fromModel(artifactObject.files);
  });
}

export function getArtifactsFiles(extensions: ExtensionDataList): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts.map((artifacts) => artifacts.files);
}

export function reStructureBuildArtifacts(extensions: ExtensionDataList) {
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

function getBuildArtifacts(extensions: ExtensionDataList): ArtifactObject[] {
  return extensions.findExtension('teambit.pipelines/builder')?.data?.artifacts || [];
}
