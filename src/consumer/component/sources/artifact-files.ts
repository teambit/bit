import R from 'ramda';
import { compact } from 'lodash';
import ShowDoctorError from '../../../error/show-doctor-error';
import { Scope } from '../../../scope';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { Source } from '../../../scope/models';
import { Ref } from '../../../scope/objects';
import { pathNormalizeToLinux } from '../../../utils';
import { ExtensionDataList } from '../../config';
import Component from '../consumer-component';
import { ArtifactVinyl } from './artifact';
import { ArtifactFile, ArtifactModel, ArtifactFileObject } from './artifact-file';

export type ArtifactSource = { relativePath: string; source: Source };
export type ArtifactObject = {
  name: string;
  description?: string;
  generatedBy: string;
  storage: string | string[];
  task: {
    id: string;
    name?: string;
  };
  files: ArtifactFiles;
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
  constructor(public files: ArtifactFile[]) {}

  clone() {
    const files = this.files.map((file) => file.clone());
    return new ArtifactFiles(files);
  }

  // populateRefsFromSources(sources: ArtifactSource[]) {
  //   this.refs = sources.map((source) => ({ relativePath: source.relativePath, ref: source.source.hash() }));
  // }

  populateVinylsFromPaths(rootDir: string) {
    this.files.forEach((file) => file.populateVinylFromPath(rootDir));
  }

  getRefs(): Ref[] {
    const refs = this.files.map((file) => file.getRef());
    return compact(refs);
  }

  getExistingVinyls() {
    return this.files.map((file) => file.vinyl);
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

  static fromVinylsToSources(vinyls: ArtifactVinyl[]): ArtifactSource[] {
    return vinyls.map((artifact) => {
      return {
        relativePath: pathNormalizeToLinux(artifact.relative),
        source: artifact.toSourceAsLinuxEOL(),
      };
    });
  }

  async getVinylsAndImportIfMissing(scopeName: string, scope: Scope): Promise<ArtifactVinyl[]> {
    if (this.isEmpty()) return [];
    const vinyls: ArtifactVinyl[] = [];
    const hashes: string[] = [];
    const artifactsToLoadFromScope: ArtifactFile[] = [];
    const artifactsToLoadFromOtherResolver: ArtifactFile[] = [];

    this.files.forEach((file) => {
      if (file.vinyl) {
        return vinyls.push(file.vinyl);
      }
      // By default try to fetch artifact from the default resolver
      const ref = file.getRef();
      if (ref) {
        artifactsToLoadFromScope.push(file);
        return hashes.push(ref.hash);
      }
      return artifactsToLoadFromOtherResolver.push(file);
    });

    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    await scopeComponentsImporter.importManyObjects({ [scopeName]: hashes });

    const vinylsFromScope = await Promise.all(
      artifactsToLoadFromScope.map(async (file) => {
        const ref = file.getRef();
        if (!ref) return undefined;
        const content = (await ref.load(scope.objects)) as Source;
        if (!content) throw new ShowDoctorError(`failed loading file ${file.relativePath} from the model`);
        return new ArtifactVinyl({ base: '.', path: file.relativePath, contents: content.contents });
      })
    );

    const vinylsFromOtherStorage = await Promise.all(
      artifactsToLoadFromOtherResolver.map(async (file) => {
        return file.populateVinylFromStorage();
      })
    );

    return vinyls.concat(compact(vinylsFromScope)).concat(compact(vinylsFromOtherStorage));
  }
}

export async function importMultipleDistsArtifacts(scope: Scope, components: Component[]) {
  const extensionsNamesForDistArtifacts = 'teambit.compilation/compiler';
  const groupedHashes: { [scopeName: string]: string[] } = {};
  components.forEach((component) => {
    const artifactsFiles = getArtifactFilesByExtension(component.extensions, extensionsNamesForDistArtifacts);
    artifactsFiles.forEach((artifactFiles) => {
      if (!artifactFiles) return;
      // if (!(artifactFiles instanceof ArtifactFiles)) {
      //   artifactFiles = deserializeArtifactFiles(artifactFiles);
      // }
      if (artifactFiles.isEmpty()) return;
      // if (artifactFiles.vinyls.length) return;
      // const allHashes = artifactFiles.refs.map((artifact) => artifact.ref.hash);
      const allHashes = artifactFiles.getRefs().map((ref) => ref.hash);
      (groupedHashes[component.scope as string] ||= []).push(...allHashes);
    });
  });
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  await scopeComponentsImporter.importManyObjects(groupedHashes);
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
