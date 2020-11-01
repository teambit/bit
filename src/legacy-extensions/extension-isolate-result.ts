import path from 'path';
import Vinyl from 'vinyl';

import Capsule from '../../legacy-capsule/core/capsule';
import ConsumerComponent from '../consumer/component';
import { AbstractVinyl, Dist } from '../consumer/component/sources';
import Isolator from '../environment/isolator';
import { getComponentsDependenciesLinks } from '../links/link-generator';
import { ComponentWithDependencies } from '../scope';

/**
 * This is a formal API for extension developers, changes in this API should result a major version.
 */

export default class ExtensionIsolateResult {
  private isolator: Isolator;
  capsule: Capsule;
  componentWithDependencies: ComponentWithDependencies;

  constructor(isolator: Isolator, componentWithDependencies: ComponentWithDependencies) {
    this.isolator = isolator;
    this.capsule = isolator.capsule;
    this.componentWithDependencies = componentWithDependencies;
  }

  async capsuleExec(cmd, options) {
    await this.isolator.capsuleExec(cmd, options);
  }

  async writeDists(builtFiles, mainDist): Promise<void> {
    const capsuleComponent: ConsumerComponent = this.componentWithDependencies.component;
    if (!capsuleComponent.dists || capsuleComponent.dists.isEmpty()) {
      if (!builtFiles) {
        return;
      }
      capsuleComponent.setDists(
        builtFiles.map((file) => new Dist(file)),
        mainDist
      );
    }
    // Make sure we are going to write the dists files (also for testers)
    capsuleComponent.dists.writeDistsFiles = true;

    const distsToWrite = await capsuleComponent.dists.getDistsToWrite(
      capsuleComponent,
      this.isolator.capsuleBitMap,
      null,
      true,
      this.componentWithDependencies
    );

    if (distsToWrite) {
      await distsToWrite.persistAllToCapsule(this.capsule);
    }
  }

  async writeLinks() {
    await this.isolator.writeLinks();
  }

  getDependenciesLinks(): Vinyl[] {
    const links = getComponentsDependenciesLinks(
      [this.componentWithDependencies],
      null,
      false,
      this.isolator.capsuleBitMap
    );
    return links.files;
  }

  addSharedDir(filesToAdd: Vinyl[]): Vinyl[] {
    const sharedDir = this.componentWithDependencies.component.originallySharedDir;
    let updatedFiles = filesToAdd;
    if (sharedDir) {
      updatedFiles = filesToAdd.map((file) => {
        const fileAsAbstractVinyl = AbstractVinyl.fromVinyl(file);
        fileAsAbstractVinyl.updatePaths({ newRelative: path.join(sharedDir, file.relative) });
        return fileAsAbstractVinyl;
      });
    }
    return updatedFiles;
  }
  async installPackages(packages: string[] = []) {
    await this.isolator.installPackagesOnRoot(packages);
    // after installing packages on capsule root, some links/symlinks from node_modules might
    // be deleted. rewrite the links to recreate them.
    await this.isolator.writeLinksOnNodeModules();
  }
}
