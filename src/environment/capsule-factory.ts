import { BitCapsule, FsContainer } from '../capsule-ext';

export default (async function createCapsule(type = 'fs', dir?: string): Promise<BitCapsule> {
  function getContainerFactory() {
    switch (type) {
      case 'fs':
      default:
        return {
          createContainer: async function create() {
            return new FsContainer({ wrkDir: dir });
          }
        };
    }
  }
  const containerFactory = getContainerFactory();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const capsule = await BitCapsule.create(containerFactory);
  await capsule.start();
  return capsule;
});
