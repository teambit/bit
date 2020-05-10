import ConsumerComponent from '../../consumer/component';
import { Capsule } from './capsule';
import { getComponentLinks } from '../../links/link-generator';
import { getManipulateDirForComponentWithDependencies } from '../../consumer/component-ops/manipulate-dir';

import { ComponentWithDependencies } from '../../scope';
import ManyComponentsWriter, { ManyComponentsWriterParams } from '../../consumer/component-ops/many-components-writer';

import CapsuleList from './capsule-list';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?
import { BitId } from '../../bit-id';
import { Dependencies } from '../../consumer/component/dependencies';

export default async function writeComponentsToCapsules(
  components: ConsumerComponent[],
  graph: Graph,
  capsules: Capsule[],
  capsuleList: CapsuleList,
  packageManager: string
) {
  components = components.map(c => c.clone());
  const writeToPath = '.';
  const componentsWithDependencies = components.map(component => {
    const getClonedFromGraph = (id: BitId): ConsumerComponent => {
      const consumerComponent = graph.node(id.toString());
      if (!consumerComponent) {
        throw new Error(
          `unable to find the dependency "${id.toString()}" of "${component.id.toString()}" in the graph`
        );
      }
      return consumerComponent.clone();
    };
    const getDeps = (dependencies: Dependencies) => dependencies.get().map(dep => getClonedFromGraph(dep.id));
    const dependencies = getDeps(component.dependencies);
    const devDependencies = getDeps(component.devDependencies);
    const extensionDependencies = component.extensions.extensionsBitIds.map(getClonedFromGraph);
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies,
      extensionDependencies
    });
  });
  const concreteOpts: ManyComponentsWriterParams = {
    componentsWithDependencies,
    writeToPath,
    override: false,
    writePackageJson: true,
    writeConfig: false,
    writeBitDependencies: false,
    createNpmLinkFiles: false,
    saveDependenciesAsComponents: false,
    writeDists: false,
    installNpmPackages: false,
    installPeerDependencies: false,
    addToRootPackageJson: false,
    verbose: false,
    excludeRegistryPrefix: false,
    silentPackageManagerResult: false,
    isolated: true,
    packageManager,
    applyExtensionsAddedConfig: true
  };
  componentsWithDependencies.map(cmp => normalizeComponentDir(cmp));
  const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
  await manyComponentsWriter._populateComponentsFilesToWrite();
  componentsWithDependencies.forEach(componentWithDependencies => {
    const links = getComponentLinks({
      component: componentWithDependencies.component,
      dependencies: componentWithDependencies.allDependencies,
      createNpmLinkFiles: false,
      bitMap: manyComponentsWriter.bitMap
    });
    componentWithDependencies.component.dataToPersist.addManyFiles(links.files);
  });
  // write data to capsule
  await Promise.all(
    manyComponentsWriter.writtenComponents.map(async componentToWrite => {
      const capsule = capsuleList.getCapsule(componentToWrite.id);
      if (!capsule) return;
      await componentToWrite.dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: true });
    })
  );
  return manyComponentsWriter.writtenComponents;
}

function normalizeComponentDir(componentWithDependencies: ComponentWithDependencies) {
  const allComponents = [componentWithDependencies.component, ...componentWithDependencies.allDependencies];
  const manipulateDirData = getManipulateDirForComponentWithDependencies(componentWithDependencies);
  allComponents.forEach(component => {
    component.stripOriginallySharedDir(manipulateDirData);
  });
}
