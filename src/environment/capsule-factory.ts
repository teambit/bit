import Capsule from '../../components/core/capsule';
import FsContainer from '../../components/container/fs-container';

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
