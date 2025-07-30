import path from 'path';
import filenamify from 'filenamify';
import fs from 'fs-extra';
import type { ComponentMain } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import pMapSeries from 'p-map-series';
import minimatch from 'minimatch';
import { ArtifactFiles } from '@teambit/component.sources';
import type { BuilderMain } from '../builder.main.runtime';
import type { ArtifactsOpts } from './artifacts.cmd';
import { ArtifactList } from './artifact-list';
import { Artifact } from './artifact';

export type ExtractorResult = {
  id: ComponentID;
  artifacts: ExtractorArtifactResult[];
};

export type ExtractorArtifactResult = {
  artifactName: string;
  aspectId: string;
  taskName: string;
  files: string[];
};

export type ExtractorResultGrouped = {
  id: ComponentID;
  artifacts: { [aspectId: string]: ExtractorArtifactResult[] };
};

type ArtifactListPerId = {
  id: ComponentID;
  artifacts: ArtifactList<Artifact>;
};

export class ArtifactExtractor {
  constructor(
    private componentMain: ComponentMain,
    private builder: BuilderMain,
    private pattern: string,
    private options: ArtifactsOpts
  ) {}

  async list(): Promise<ExtractorResult[]> {
    const host = this.componentMain.getHost();
    const ids = await host.idsByPattern(this.pattern);
    const scope = this.componentMain.getHost(ScopeAspect.id) as ScopeMain;
    // import in case the components are with build status "pending"
    await scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(ids), { reason: 'artifact' });
    const components = await host.getMany(ids);
    const artifactListPerId: ArtifactListPerId[] = components.map((component) => {
      return {
        id: component.id,
        artifacts: this.builder.getArtifacts(component),
      };
    });
    this.filterByOptions(artifactListPerId);
    await this.saveFilesInFileSystemIfAsked(artifactListPerId);

    return this.artifactsObjectsToExtractorResults(artifactListPerId);
  }

  groupResultsByAspect(extractorResult: ExtractorResult[]) {
    return extractorResult.map((result) => {
      const artifacts = result.artifacts.reduce((acc, current) => {
        (acc[current.aspectId] ||= []).push(current);
        return acc;
      }, {});
      return { id: result.id, artifacts };
    });
  }

  private async saveFilesInFileSystemIfAsked(artifactListPerId: ArtifactListPerId[]) {
    const outDir = this.options.outDir;
    if (!outDir) {
      return;
    }
    const scope = this.componentMain.getHost(ScopeAspect.id) as ScopeMain;
    // @todo: optimize this to first import all missing hashes.
    await pMapSeries(artifactListPerId, async ({ id, artifacts }) => {
      const vinyls = await artifacts.getVinylsAndImportIfMissing(id, scope.legacyScope);
      // make sure the component-dir is just one dir. without this, every slash in the component-id will create a new dir.
      const idAsFilename = filenamify(id.toStringWithoutVersion(), { replacement: '_' });
      const compPath = path.join(outDir, idAsFilename);
      await Promise.all(vinyls.map((vinyl) => fs.outputFile(path.join(compPath, vinyl.path), vinyl.contents)));
    });
  }

  private artifactsObjectsToExtractorResults(artifactListPerId: ArtifactListPerId[]): ExtractorResult[] {
    return artifactListPerId.map(({ id, artifacts }) => {
      const results: ExtractorArtifactResult[] = artifacts.map((artifact) => {
        return {
          artifactName: artifact.name,
          aspectId: artifact.task.aspectId,
          taskName: artifact.task.name || artifact.generatedBy,
          files: artifact.files.refs.map((ref) => ref.relativePath),
        };
      });
      return {
        id,
        artifacts: results,
      };
    });
  }

  private filterByOptions(artifactListPerId: ArtifactListPerId[]) {
    const { aspect, task, files } = this.options;
    let filteredArtifacts: Artifact[] = [];

    artifactListPerId.forEach((item) => {
      filteredArtifacts = item.artifacts.filter((artifact) => {
        if (aspect && aspect !== artifact.task.aspectId) return false;
        if (task && task !== artifact.task.name) return false;
        return true;
      });
      if (files) {
        filteredArtifacts = item.artifacts
          .map((artifact) => {
            const refs = artifact.files.refs.filter((ref) => minimatch(ref.relativePath, files));
            return new Artifact(artifact.def, new ArtifactFiles([], [], refs), artifact.task);
          })
          // remove artifacts with no files
          .filter((artifact) => !artifact.isEmpty());
      }
      item.artifacts = ArtifactList.fromArray(filteredArtifacts);
    });
  }
}
