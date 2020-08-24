import FsContainer from '../../legacy-capsule/container/fs-container';
import Capsule from '../../legacy-capsule/core/capsule';

export default (async function createCapsule(type = 'fs', dir?: string): Promise<Capsule> {
  const containerFactory = getContainerFactory();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const capsule = await Capsule.create(containerFactory);
  await capsule.start();
  return capsule;

  function getContainerFactory(): Function {
    switch (type) {
      case 'fs':
      default:
        return async () => new FsContainer(dir);
    }
  }
});
