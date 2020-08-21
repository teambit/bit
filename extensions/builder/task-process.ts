import { flatten } from 'ramda';
import { BuildTask, BuildResults, BuildContext } from './types';
import GeneralError from 'bit-bin/dist/error/general-error';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config/extension-data';
import { Component } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Artifact } from 'bit-bin/dist/consumer/component/sources/artifact';

export class TaskProcess {
  constructor(
    private task: BuildTask,
    private taskResult: BuildResults,
    private buildContext: BuildContext,
    private extensionId = task.extensionId
  ) {}

  public throwIfErrorsFound() {
    const compsWithErrors = this.taskResult.components.filter((c) => c.errors.length);
    if (compsWithErrors.length) {
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

  public async saveTaskResults() {
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
      component.config.extensions.findCoreExtension(this.extensionId) ||
      component.config.extensions.findExtension(this.extensionId);
    if (existingExtensionDataEntry) return existingExtensionDataEntry;
    const extensionDataEntry = new ExtensionDataEntry(undefined, undefined, this.extensionId);
    component.config.extensions.push(extensionDataEntry);
    return extensionDataEntry;
  }

  private async getFilesByArtifacts(capsule: Capsule): Promise<string[]> {
    const filesP = this.taskResult.artifacts.map(async (artifact) => {
      return capsule.getAllFilesPaths(artifact.dirName);
    });
    return flatten(await Promise.all(filesP));
  }
}
