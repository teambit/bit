import path from 'path';
import fs from 'fs-extra';
import { ScopeMain } from '@teambit/scope';
import { ComponentID } from '@teambit/component-id';
import pMapSeries from 'p-map-series';
import minimatch from 'minimatch';
import { BuilderMain, ArtifactList, Artifact } from '@teambit/builder';
import { ArtifactsOpts } from './artifacts.cmd';

export type ExtractorResult = {
  id: ComponentID;
  artifacts: ExtractorArtifactResult[];
};

export type ExtractorArtifactResult = {
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
    private scope: ScopeMain,
    private builder: BuilderMain,
    private patterns: string[],
    private options: ArtifactsOpts
  ) {}

  async list(): Promise<ExtractorResult[]> {
    const components = await this.scope.byPattern(this.patterns);
    const artifactListPerId: ArtifactListPerId[] = components.map((component) => {
      return {
        id: component.id,
        artifacts: this.builder._getArtifacts(component) || [],
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
    // @todo: optimize this to first import all missing hashes.
    await pMapSeries(artifactListPerId, async ({ id, artifacts }) => {
      const vinyls = await artifacts.getVinylsAndImportIfMissing(id.scope as string, this.scope);
      const compPath = path.join(outDir, id.toStringWithoutVersion());
      await Promise.all(vinyls.map((vinyl) => fs.outputFile(path.join(compPath, vinyl.path), vinyl.contents)));
    });
  }

  private artifactsObjectsToExtractorResults(artifactListPerId: ArtifactListPerId[]): ExtractorResult[] {
    return artifactListPerId.map(({ id, artifacts }) => {
      const results: ExtractorArtifactResult[] = artifacts.map((artifact) => {
        return {
          aspectId: artifact.task.aspectId,
          taskName: artifact.task.name || artifact.generatedBy,
          files: artifact.files.map((file) => file.relativePath),
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
    artifactListPerId.forEach((item) => {
      item.artifacts = item.artifacts.filter((artifact) => {
        if (aspect && aspect !== artifact.task.aspectId) return false;
        if (task && task !== artifact.task.name) return false;
        return true;
      });
      if (files) {
        item.artifacts.forEach((artifact) => {
          const filteredFiled = artifact.files.filter((file) => minimatch(file.relativePath, files));
          artifact.files = filteredFiled;
        });
        // remove artifacts with no files
        item.artifacts = item.artifacts.filter((artifact) => !artifact.isEmpty());
      }
    });
  }
}
