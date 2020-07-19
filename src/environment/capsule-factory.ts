import { Capsule, FsContainer } from '../extensions/isolator/capsule';

export default (async function createCapsule(type = 'fs', dir?: string): Promise<Capsule> {
  function getContainerFactory() {
    switch (type) {
      case 'fs':
      default:
        return {
          createContainer: async function create() {
            return new FsContainer(dir || '');
          },
        };
    }
  }
  const containerFactory = getContainerFactory();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const capsule = await Capsule.create(containerFactory);
  await capsule.start();
  return capsule;
});
