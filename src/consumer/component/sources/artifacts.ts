import ShowDoctorError from '../../../error/show-doctor-error';
import { Scope } from '../../../scope';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { Source } from '../../../scope/models';
import { Ref } from '../../../scope/objects';
import { pathNormalizeToLinux } from '../../../utils';

import { ArtifactVinyl } from './artifact';

export type ArtifactRef = { relativePath: string; ref: Ref };
export type ArtifactModel = { relativePath: string; file: string };
export type ArtifactSource = { relativePath: string; source: Source };

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
export class Artifacts {
  constructor(public vinyls: ArtifactVinyl[] = [], public refs: ArtifactRef[] = []) {}

  clone() {
    const vinyls = this.vinyls.map((vinyl) => vinyl.clone());
    const refs = this.refs.map((ref) => ({ ...ref }));
    return new Artifacts(vinyls, refs);
  }

  fromVinylsToSources(): ArtifactSource[] {
    // @todo: clone before converting maybe
    return this.vinyls.map((artifact) => {
      return {
        relativePath: pathNormalizeToLinux(artifact.relative),
        source: artifact.toSourceAsLinuxEOL(),
      };
    });
  }

  populateRefsFromSources(sources: ArtifactSource[]) {
    this.refs = sources.map((source) => ({ relativePath: source.relativePath, ref: source.source.hash() }));
  }

  toModelObjects(): ArtifactModel[] {
    return this.refs.map((artifact) => {
      return {
        relativePath: artifact.relativePath,
        file: artifact.ref.hash,
      };
    });
  }

  getExistingVinyls() {
    return this.vinyls;
  }

  isEmpty() {
    return !this.vinyls.length && !this.refs.length;
  }

  static fromModel(refs: ArtifactRef[]) {
    return new Artifacts([], refs);
  }

  async getVinylsAndImportIfMissing(scopeName: string, scope: Scope): Promise<ArtifactVinyl[]> {
    if (this.isEmpty()) return [];
    if (this.vinyls.length) return this.vinyls;
    const allHashes = this.refs.map((artifact) => artifact.ref.hash);
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    await scopeComponentsImporter.importManyObjects({ [scopeName]: allHashes });
    const getOneArtifact = async (artifact: ArtifactRef) => {
      const content = (await artifact.ref.load(scope.objects)) as Source;
      if (!content) throw new ShowDoctorError(`failed loading file ${artifact.relativePath} from the model`);
      return new ArtifactVinyl({ base: '.', path: artifact.relativePath, contents: content.contents });
    };
    this.vinyls = await Promise.all(this.refs.map((artifact) => getOneArtifact(artifact)));
    return this.vinyls;
  }
}
