import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { Artifact } from 'bit-bin/dist/consumer/component/sources/artifact';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config/extension-data';
import GeneralError from 'bit-bin/dist/error/general-error';
import { flatten, isEmpty } from 'ramda';

import { BuildContext, BuildResults, BuildTask } from './types';

export class TaskProcess {
  constructor(
    private task: BuildTask,
    private taskResult: BuildResults,
    private buildContext: BuildContext,
    private logger: Logger
  ) {}

  public throwIfErrorsFound() {
    const compsWithErrors = this.taskResult.components.filter((c) => c.errors?.length);
    if (compsWithErrors.length) {
      this.logger.consoleFailure(`task "${this.task.id}" has failed`);
      const title = `Builder found the following errors while running "${this.task.id}" task\n`;
      let totalErrors = 0;
      const errorsStr = compsWithErrors
        .map((c) => {
          const rawErrors = c.errors || [];
          const errors = rawErrors.map((e) => (typeof e === 'string' ? e : e.toString()));
          totalErrors += errors.length;
          return `${c.component.id.toString()}\n${errors.join('\n')}`;
        })
        .join('\n\n');
      const summery = `\n\nFound ${totalErrors} errors in ${compsWithErrors.length} components`;
      throw new GeneralError(title + errorsStr + summery);
    }
  }

  // rename artifact here to files.
  public async saveTaskResults(files: Artifact[]): Promise<Component[]> {
    const { components } = this.buildContext;
    const resultsP = components.map(async (component) => {
      this.saveDataToComponent(component);
      await this.saveArtifactsToComponent(component, files);
    });
    await Promise.all(resultsP);
    return components;
  }

  private saveDataToComponent(component: Component) {
    // @todo: fix to use isEqual of ComponentId, not the legacy. currently it's not working
    // due to defaultScope discrepancies.
    const componentResult = this.taskResult.components.find((c) =>
      c.component.id._legacy.isEqual(component.id._legacy)
    );
    const data = componentResult && componentResult.metadata;
    if (data) {
      const extensionDataEntry = this.getExtensionDataEntry(component);
      extensionDataEntry.data = this.mergeDataIfPossible(data, extensionDataEntry.data);
    }
  }

  private mergeDataIfPossible(currentData, existingData) {
    if (!existingData || isEmpty(existingData)) return currentData;
    if (!currentData || isEmpty(currentData)) return existingData;
    // both exist
    if (typeof currentData !== 'object') {
      throw new Error(`task data must be "object", get ${typeof currentData} for ${this.task.id}`);
    }
    if (Array.isArray(currentData)) {
      throw new Error(`task data must be "object", get ${typeof currentData} for an array`);
    }
    return { ...currentData, ...existingData };
  }

  private async saveArtifactsToComponent(component: Component, artifacts: Artifact[]) {
    // const { artifacts } = this.taskResult;
    if (artifacts.length) {
      const extensionDataEntry = this.getExtensionDataEntry(component);
      const capsule = this.buildContext.capsuleGraph.capsules.getCapsule(component.id);
      if (!capsule) throw new Error(`unable to find the capsule for ${component.id.toString()}`);
      const files = await this.getFilesByArtifacts(capsule, artifacts);

      const artifactsVinyl = files.map((file) => new Artifact({ path: file, contents: capsule.fs.readFileSync(file) }));
      extensionDataEntry.artifacts = artifactsVinyl;
    }
  }

  private getExtensionDataEntry(component: Component): ExtensionDataEntry {
    const existingExtensionDataEntry =
      component.config.extensions.findCoreExtension(this.task.id) ||
      component.config.extensions.findExtension(this.task.id);
    if (existingExtensionDataEntry) return existingExtensionDataEntry;
    const extensionDataEntry = new ExtensionDataEntry(undefined, undefined, this.task.id);
    component.config.extensions.push(extensionDataEntry);
    return extensionDataEntry;
  }

  private async getFilesByArtifacts(capsule: Capsule, artifacts: Artifact[]): Promise<string[]> {
    const filesP = artifacts.map(async (artifact) => {
      if (artifact.fileName) return artifact.fileName;
      return capsule.getAllFilesPaths(artifact.dirName);
    });
    return flatten(await Promise.all(filesP));
  }
}
