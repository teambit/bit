import R from 'ramda';
import { compact } from 'lodash';
import { BitId } from '../../../bit-id';
import { Scope } from '../../../scope';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { Source } from '../../../scope/models';
import { Ref } from '../../../scope/objects';
import logger from '../../../logger/logger';
import { ExtensionDataList } from '../../config';
import Component from '../consumer-component';
import { ArtifactFile, ArtifactModel, ArtifactFileObject } from './artifact-file';
import { ArtifactVinyl } from './artifact';

export type ArtifactRef = { relativePath: string; ref: Ref; url?: string };
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

/**
 * Artifacts utilize lazy loading mechanism. As such, when loading them from the objects, they are
 * not converted to ArtifactVinyl[]. Instead, they are loaded as ArtifactRef[].
 * Later, when they're needed, the `importMissingArtifactObjects` method is used to import them from a remote.
 *
 * the workflow of an artifact during the tag is as follows:
 * 1. First, it got created on a capsule and saved to the ConsumerComponent as ArtifactVinyl.
 * 2. On tag, it is transformed to ArtifactSource in order to save the Sources (BitObjects) in the objects.
 * 3. Finally, once the Version object is saved, it needs to save only the hash of the artifacts, hence ArtifactModel.
 */
export class ArtifactFiles {
  constructor(public files: ArtifactFile[]) {}

  clone() {
    const files = this.files.map((file) => file.clone());
    return new ArtifactFiles(files);
  }

  map(cb: (ArtifactFile: ArtifactFile) => any): Array<any> {
    return this.files.map((file) => cb(file));
  }

  forEach(fn: (file: ArtifactFile) => void) {
    return this.files.forEach((artifact) => fn(artifact));
  }

  filter(fn: (file: ArtifactFile) => boolean): ArtifactFiles {
    const filtered = this.files.filter((artifact) => fn(artifact));
    return new ArtifactFiles(filtered);
  }

  populateRefsFromSources() {
    this.files.forEach((file) => file.populateRefFromSource());
  }

  getRefs(): Ref[] {
    const refs = this.files.map((file) => file.ref);
    return compact(refs);
  }

  getSources(): ArtifactSource[] {
    const sources = this.files.map((file) => file.source);
    return compact(sources);
  }

  getRelativePaths(): string[] {
    const paths = this.files.map((file) => file.relativePath);
    return paths;
  }

  populateVinylsFromPaths(rootDir: string) {
    this.files.forEach((file) => file.populateVinylFromPath(rootDir));
  }

  populateArtifactSourceFromVinyl() {
    this.files.forEach((file) => file.populateArtifactSourceFromVinyl());
  }
  getExistingVinyls() {
    return compact(this.files.map((file) => file.vinyl));
  }

  isEmpty() {
    return !this.files.length;
  }

  toModelObject() {
    return this.files.map((file) => file.toModelObject());
  }

  static parse(files: ArtifactFileObject[]): ArtifactFiles {
    const parsedFiles = files.map((file) => ArtifactFile.parse(file));
    return new ArtifactFiles(parsedFiles);
  }

  static fromModel(artifactModels: ArtifactModel[] = []) {
    const files = artifactModels.map((artifactModel) => ArtifactFile.fromModel(artifactModel));
    return new ArtifactFiles(files);
  }

  static fromPaths(paths: string[]) {
    const files = paths.map((path) => new ArtifactFile(path));
    return new ArtifactFiles(files);
  }

  fromVinylsToSources(): ArtifactSource[] {
    const sources = this.files.map((file) => file.populateArtifactSourceFromVinyl());
    return compact(sources);
  }
  async getVinylsAndImportIfMissing(id: BitId, scope: Scope): Promise<ArtifactVinyl[]> {
    await this.importMissingArtifactObjects(id, scope);
    return this.getExistingVinyls();
  }

  async importMissingArtifactObjects(id: BitId, scope: Scope): Promise<void> {
    const artifactsToLoadFromScope: ArtifactFile[] = [];
    const hashes: string[] = [];

    this.files.forEach((file) => {
      if (file.vinyl) {
        return undefined;
      }
      // By default try to fetch artifact from the default resolver
      const artifactRef = file.getArtifactRef();
      if (artifactRef) {
        artifactsToLoadFromScope.push(file);
        hashes.push(artifactRef.ref.hash);
      }
      return undefined;
    });

    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    const lane = await scope.getCurrentLaneObject();
    const isIdOnLane = lane?.toBitIds().hasWithoutVersion(id);

    const scopeName = isIdOnLane ? (lane?.scope as string) : (id.scope as string);
    await scopeComponentsImporter.importManyObjects({ [scopeName]: hashes });

    await Promise.all(artifactsToLoadFromScope.map((artifact) => artifact.populateVinylFromRef(scope)));
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
  const laneIds = lane?.toBitIds();
  const groupedHashes: { [scopeName: string]: string[] } = {};
  await Promise.all(
    components.map(async (component) => {
      const artifactsFiles = getArtifactFilesByExtension(component.extensions, extensionsNamesForDistArtifacts);
      const scopeName = (await scope.isIdOnLane(component.id, lane, laneIds))
        ? (lane?.scope as string)
        : (component.scope as string);
      artifactsFiles.forEach((artifactFiles) => {
        if (!artifactFiles) return;
        if (!(artifactFiles instanceof ArtifactFiles)) {
          artifactFiles = ArtifactFiles.parse(artifactFiles);
        }
        if (artifactFiles.isEmpty()) return;
        if (artifactFiles.getExistingVinyls().length) return;
        const allHashes = artifactFiles.getRefs().map((artifact) => artifact.hash);
        (groupedHashes[scopeName] ||= []).push(...allHashes);
      });
    })
  );
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importManyObjects(groupedHashes);
  logger.debug(`importMultipleDistsArtifacts: ${components.length} components. completed successfully`);
}

export function getRefsFromExtensions(extensions: ExtensionDataList): Ref[] {
  const artifactsFilesList = getArtifactsFiles(extensions);
  const refs = artifactsFilesList.map((artifactsFiles) => artifactsFiles.getRefs());
  return R.flatten(refs);
}

export function getArtifactFilesByExtension(extensions: ExtensionDataList, extensionName: string): ArtifactFiles[] {
  const buildArtifacts = getBuildArtifacts(extensions);
  return buildArtifacts.filter((artifact) => artifact.task.id === extensionName).map((artifact) => artifact.files);
}

export function convertBuildArtifactsToModelObject(extensions: ExtensionDataList) {
  const buildArtifacts = getBuildArtifacts(extensions);
  buildArtifacts.forEach((artifact) => {
    // @ts-ignore
    artifact.files = artifact.files.toModelObject();
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

export function cloneBuildArtifacts(extensions: ExtensionDataList) {
  // convertBuildArtifactsFromModelObject(extensions);
  const buildArtifacts = getBuildArtifacts(extensions);
  const ext = extensions.findExtension('teambit.pipelines/builder');
  if (buildArtifacts && buildArtifacts.length && ext) {
    buildArtifacts.forEach((artifact) => {
      // During the original clone the files might be converted from instance of ArtifactFiles to regular array
      // so we re-create the ArtifactFiles instance
      artifact.files = artifact.files.files ? ArtifactFiles.parse(artifact.files.files) : artifact.files.files;
    });
  }
}

function getBuildArtifacts(extensions: ExtensionDataList): ArtifactObject[] {
  return extensions.findExtension('teambit.pipelines/builder')?.data?.artifacts || [];
}
