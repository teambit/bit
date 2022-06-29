import path from 'path';
import fs from 'fs-extra';
import { ScopeMain } from '@teambit/scope';
import { ComponentID } from '@teambit/component-id';
import pMapSeries from 'p-map-series';
import minimatch from 'minimatch';
import { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { BuilderMain } from '../builder.main.runtime';
import { ArtifactsOpts } from './artifacts.cmd';

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

type ArtifactObjectsPerId = {
  id: ComponentID;
  artifacts: ArtifactObject[];
};

export class ArtifactExtractor {
  constructor(
    private scope: ScopeMain,
    private builder: BuilderMain,
    private pattern: string,
    private options: ArtifactsOpts
  ) {}

  async list(): Promise<ExtractorResult[]> {
    const ids = await this.scope.idsByPattern(this.pattern);
    const components = await this.scope.loadMany(ids);
    const artifactObjectsPerId: ArtifactObjectsPerId[] = components.map((component) => {
      return {
        id: component.id,
        artifacts: this.builder.getArtifacts(component) || [],
      };
    });
    this.filterByOptions(artifactObjectsPerId);
    await this.saveFilesInFileSystemIfAsked(artifactObjectsPerId);

    return this.artifactsObjectsToExtractorResults(artifactObjectsPerId);
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

  private async saveFilesInFileSystemIfAsked(artifactObjectsPerId: ArtifactObjectsPerId[]) {
    const outDir = this.options.outDir;
    if (!outDir) {
      return;
    }
    // @todo: optimize this to first import all missing hashes.
    await pMapSeries(artifactObjectsPerId, async ({ id, artifacts }) => {
      const vinyls = await Promise.all(
        artifacts.map((artifactObject) =>
          artifactObject.files.getVinylsAndImportIfMissing(id.scope as string, this.scope.legacyScope)
        )
      );
      const flattenedVinyls = vinyls.flat();
      const compPath = path.join(outDir, id.toStringWithoutVersion());
      await Promise.all(flattenedVinyls.map((vinyl) => fs.outputFile(path.join(compPath, vinyl.path), vinyl.contents)));
    });
  }

  private artifactsObjectsToExtractorResults(artifactObjectsPerId: ArtifactObjectsPerId[]): ExtractorResult[] {
    return artifactObjectsPerId.map(({ id, artifacts }) => {
      const results: ExtractorArtifactResult[] = artifacts.map((artifact) => {
        return {
          artifactName: artifact.name,
          aspectId: artifact.task.id,
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

  private filterByOptions(artifactObjectsPerId: ArtifactObjectsPerId[]) {
    const { aspect, task, files } = this.options;
    artifactObjectsPerId.forEach((item) => {
      item.artifacts = item.artifacts.filter((artifact) => {
        if (aspect && aspect !== artifact.task.id) return false;
        if (task && task !== artifact.task.name) return false;
        return true;
      });
      if (files) {
        item.artifacts.forEach((artifact) => {
          const refs = artifact.files.refs.filter((ref) => minimatch(ref.relativePath, files));
          artifact.files = new ArtifactFiles([], [], refs);
        });
        // remove artifacts with no files
        item.artifacts = item.artifacts.filter((artifact) => artifact.files.refs.length);
      }
    });
  }
}
