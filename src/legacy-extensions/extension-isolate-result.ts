import path from 'path';
import Vinyl from 'vinyl';
import { ComponentWithDependencies } from '../scope';
import Isolator from '../environment/isolator';
import ConsumerComponent from '../consumer/component';
import { Dist, AbstractVinyl } from '../consumer/component/sources';
import { getComponentsDependenciesLinks } from '../links/link-generator';
import { ComponentCapsule } from '../extensions/capsule/component-capsule';

/**
 * This is a formal API for extension developers, changes in this API should result a major version.
 */

export default class ExtensionIsolateResult {
  private isolator: Isolator;
  capsule: ComponentCapsule;
  componentWithDependencies: ComponentWithDependencies;

  constructor(isolator: Isolator, componentWithDependencies: ComponentWithDependencies) {
    this.isolator = isolator;
    this.capsule = isolator.capsule;
    this.componentWithDependencies = componentWithDependencies;
  }

  capsuleExec(cmd, options) {
    this.isolator.capsuleExec(cmd, options);
  }

  async writeDists(builtFiles, mainDist): Promise<void> {
    const capsuleComponent: ConsumerComponent = this.componentWithDependencies.component;
    if (!capsuleComponent.dists || capsuleComponent.dists.isEmpty()) {
      if (!builtFiles) {
        return;
      }
      capsuleComponent.setDists(
        builtFiles.map(file => new Dist(file)),
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
      distsToWrite.persistAllToCapsule(this.capsule);
    }
  }

  writeLinks() {
    this.isolator.writeLinks();
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
      updatedFiles = filesToAdd.map(file => {
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
