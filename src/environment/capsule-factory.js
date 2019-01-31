// @flow
import Capsule from '@bit/bit.capsule-dev.core.capsule';
import FsContainer from '@bit/bit.capsule-dev.container.fs-container';

export default (async function createCapsule(type: string = 'fs', dir?: string): Promise<Capsule> {
  const containerFactory = getContainerFactory();
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
