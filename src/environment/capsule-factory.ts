import { ComponentCapsule, FsContainer } from '../extensions/capsule/component-capsule';

export default (async function createCapsule(type = 'fs', dir?: string): Promise<ComponentCapsule> {
  function getContainerFactory() {
    switch (type) {
      case 'fs':
      default:
        return {
          createContainer: async function create() {
            return new FsContainer(dir || '');
          }
        };
    }
  }
  const containerFactory = getContainerFactory();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const capsule = await ComponentCapsule.create(containerFactory);
  await capsule.start();
  return capsule;
});
