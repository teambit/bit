import { BitCapsule, FsContainer } from '../capsule';

export default (async function createCapsule(type = 'fs', dir?: string): Promise<BitCapsule> {
  function getContainerFactory() {
    const x = {
      createContainer: async function x() {
        return new FsContainer(dir);
      }
    };
    return x;
  }
  const containerFactory = getContainerFactory();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const capsule = await BitCapsule.create(containerFactory);
  await capsule.start();
  return capsule;
});
