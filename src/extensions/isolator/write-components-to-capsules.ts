import ConsumerComponent from '../../consumer/component';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import Graph from '../../scope/graph/graph'; // TODO: use graph extension?
import { BitIds } from '../../bit-id';
import { ComponentID } from '../component';
import ComponentWriter, { ComponentWriterProps } from '../../consumer/component-ops/component-writer';
import BitMap from '../../consumer/bit-map';

export default async function writeComponentsToCapsules(
  components: ConsumerComponent[],
  graph: Graph,
  capsules: Capsule[],
  capsuleList: CapsuleList
) {
  components = components.map(c => c.clone());
  const allIds = BitIds.fromArray(components.map(c => c.id));
  await Promise.all(
    components.map(async component => {
      const capsule = capsuleList.getCapsule(new ComponentID(component.id));
      if (!capsule) return;
      const params = getComponentWriteParams(component, allIds);
      const componentWriter = new ComponentWriter(params);
      await componentWriter.populateComponentsFilesToWrite();
      await component.dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: true });
    })
  );
  // return manyComponentsWriter.writtenComponents;
}

function getComponentWriteParams(component: ConsumerComponent, ids: BitIds): ComponentWriterProps {
  return {
    component,
    // @ts-ignore
    bitMap: new BitMap(),
    writeToPath: '.',
    origin: 'IMPORTED',
    consumer: undefined,
    override: false,
    writePackageJson: true,
    writeConfig: false,
    ignoreBitDependencies: ids,
    excludeRegistryPrefix: false,
    isolated: true,
    applyExtensionsAddedConfig: true
  };
}
