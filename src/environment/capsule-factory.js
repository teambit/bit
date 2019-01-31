// @flow
import Capsule from '@bit/bit.capsule-dev.core.capsule';
import FsContainer from '@bit/bit.capsule-dev.container.fs-container';

export default (async function createCapsule(type: string = 'fs'): Promise<Capsule> {
  const containerFactory = getContainerFactory(type);
  const capsule = await Capsule.create(containerFactory);
  await capsule.start();
  return capsule;
});

function getContainerFactory(type: string): Function {
  switch (type) {
    case 'fs':
    default:
      // $FlowFixMe
      return async () => new FsContainer('/tmp/capsule');
  }
}
