import glob from 'glob';
import { flatten } from 'ramda';
import path from 'path';
import { BuildTask, BuildResults, BuildContext } from './types';
import GeneralError from '../../error/general-error';
import { ExtensionDataEntry } from '../../consumer/config/extension-data';
import { Component } from '../component';
import { Capsule } from '../isolator';
import { Artifact } from '../../consumer/component/sources/artifact';

export class TaskProcess {
  constructor(
    private task: BuildTask,
    private taskResult: BuildResults,
    private buildContext: BuildContext,
    private extensionId = task.extensionId
  ) {}

  public throwIfErrorsFound() {
    const compsWithErrors = this.taskResult.components.filter(c => c.errors.length);
    if (compsWithErrors.length) {
      const title = `Builder found the following errors while running "${this.task.extensionId}" task\n`;
      const errorsStr = compsWithErrors
        .map(c => {
          const errors = c.errors.map(e => (typeof e === 'string' ? e : e.toString()));
          return `${c.id.toString()}\n${errors.join('\n')}`;
        })
        .join('\n\n');
      throw new GeneralError(title + errorsStr);
    }
  }

  public async saveTaskResults() {
    const { components } = this.buildContext;
    const resultsP = components.map(async component => {
      this.saveDataToComponent(component);
      await this.saveArtifactsToComponent(component);
    });
    await Promise.all(resultsP);
  }

  private saveDataToComponent(component: Component) {
    const componentResult = this.taskResult.components.find(c => c.id.isEqual(component.id));
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
      const artifactsVinyl = files.map(file => new Artifact({ path: file, contents: capsule.fs.readFileSync(file) }));
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
    const filesP = this.taskResult.artifacts.map(async artifact => {
      return getFilesFromCapsule(capsule, artifact.dirName);
    });
    return flatten(await Promise.all(filesP));
  }
}

// @todo: fix.
// it skips the capsule fs because for some reason `capsule.fs.promises.readdir` doesn't work
// the same as `capsule.fs.readdir` and it doesn't have the capsule dir as pwd.
/**
 * returns the paths inside the capsule
 */
async function getFilesFromCapsule(capsule: Capsule, dir: string): Promise<string[]> {
  const files = glob.sync('*', { cwd: path.join(capsule.wrkDir, dir) });
  return files.map(file => path.join(dir, file));
}
