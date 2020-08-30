import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { Artifact } from 'bit-bin/dist/consumer/component/sources/artifact';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config/extension-data';
import GeneralError from 'bit-bin/dist/error/general-error';
import { flatten } from 'ramda';

import { BuildContext, BuildResults, BuildTask } from './types';

export class TaskProcess {
  constructor(
    private task: BuildTask,
    private taskResult: BuildResults,
    private buildContext: BuildContext,
    private logger: Logger
  ) {}

  public throwIfErrorsFound() {
    const compsWithErrors = this.taskResult.components.filter((c) => c.errors.length);
    if (compsWithErrors.length) {
      this.logger.consoleFailure(`task "${this.task.extensionId}" has failed`);
      const title = `Builder found the following errors while running "${this.task.extensionId}" task\n`;
      let totalErrors = 0;
      const errorsStr = compsWithErrors
        .map((c) => {
          const errors = c.errors.map((e) => (typeof e === 'string' ? e : e.toString()));
          totalErrors += errors.length;
          return `${c.id.toString()}\n${errors.join('\n')}`;
        })
        .join('\n\n');
      const summery = `\n\nFound ${totalErrors} errors in ${compsWithErrors.length} components`;
      throw new GeneralError(title + errorsStr + summery);
    }
  }

  public async saveTaskResults(): Promise<Component[]> {
    const { components } = this.buildContext;
    const resultsP = components.map(async (component) => {
      this.saveDataToComponent(component);
      await this.saveArtifactsToComponent(component);
    });
    await Promise.all(resultsP);
    return components;
  }

  private saveDataToComponent(component: Component) {
    const componentResult = this.taskResult.components.find((c) => c.id.isEqual(component.id));
    const data = componentResult && componentResult.data;
    if (data) {
      const extensionDataEntry = this.getExtensionDataEntry(component);
      extensionDataEntry.data = data;
    }
  }

  private async saveArtifactsToComponent(component: Component) {
    const { artifacts } = this.taskResult;
    if (artifacts.length) {
      const extensionDataEntry = this.getExtensionDataEntry(component);
      const capsule = this.buildContext.capsuleGraph.capsules.getCapsule(component.id);
      if (!capsule) throw new Error(`unable to find the capsule for ${component.id.toString()}`);
      const files = await this.getFilesByArtifacts(capsule);

      const artifactsVinyl = files.map((file) => new Artifact({ path: file, contents: capsule.fs.readFileSync(file) }));
      extensionDataEntry.artifacts = artifactsVinyl;
    }
  }

  private getExtensionDataEntry(component: Component): ExtensionDataEntry {
    const existingExtensionDataEntry =
      component.config.extensions.findCoreExtension(this.task.extensionId) ||
      component.config.extensions.findExtension(this.task.extensionId);
    if (existingExtensionDataEntry) return existingExtensionDataEntry;
    const extensionDataEntry = new ExtensionDataEntry(undefined, undefined, this.task.extensionId);
    component.config.extensions.push(extensionDataEntry);
    return extensionDataEntry;
  }

  private async getFilesByArtifacts(capsule: Capsule): Promise<string[]> {
    const filesP = this.taskResult.artifacts.map(async (artifact) => {
      if (artifact.fileName) return artifact.fileName;
      return capsule.getAllFilesPaths(artifact.dirName);
    });
    return flatten(await Promise.all(filesP));
  }
}
