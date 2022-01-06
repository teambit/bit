import { createAspect } from './create-aspect';
import { MicroServiceAspect, MicroServiceMain } from '@teambit/symphony.aspects.micro-service';

describe('createAspect()', () => {
  it('should create an instance of the MicroService aspect', async () => {
    const microServiceAspect = await createAspect<MicroServiceMain>(MicroServiceAspect);
    expect(microServiceAspect.runOne).toBeDefined();
  });
});
