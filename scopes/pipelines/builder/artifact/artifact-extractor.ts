import { ScopeMain } from '@teambit/scope';
import { ComponentID } from '@teambit/component-id';
import minimatch from 'minimatch';
import { ArtifactFiles, ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { BuilderMain } from '../builder.main.runtime';
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

type ArtifactObjectsPerId = {
  id: ComponentID;
  artifacts: ArtifactObject[];
};

export class ArtifactExtractor {
  constructor(
    private scope: ScopeMain,
    private builder: BuilderMain,
    private ids: string[],
    private options: ArtifactsOpts
  ) {}

  async list(): Promise<ExtractorResult[]> {
    const components = await this.getComponents();
    const artifactObjectsPerId: ArtifactObjectsPerId[] = components.map((component) => {
      return {
        id: component.id,
        artifacts: this.builder.getArtifacts(component) || [],
      };
    });
    this.filterByOptions(artifactObjectsPerId);
    const extractorResults: ExtractorResult[] = [];
    artifactObjectsPerId.forEach(({ id, artifacts }) => {
      const results: ExtractorArtifactResult[] = artifacts.map((artifact) => {
        return {
          aspectId: artifact.task.id,
          taskName: artifact.task.name || artifact.generatedBy,
          files: artifact.files.refs.map((ref) => ref.relativePath),
        };
      });
      extractorResults.push({
        id,
        artifacts: results,
      });
    });

    return extractorResults;
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

  private async getComponents() {
    // @todo: implement patterns matching for scope
    const componentIds = await this.scope.resolveMultipleComponentIds(this.ids);
    return this.scope.loadMany(componentIds);
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
      }
    });
  }
}
