import { BitCapsule, FsContainer } from '../capsule';

export default (async function createCapsule(type = 'fs', dir?: string): Promise<BitCapsule> {
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
