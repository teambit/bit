import { expect } from 'chai';
import { LanesAspect } from './lanes.aspect';
import { LanesMain } from './lanes.main.runtime';
import { createAspect } from '@teambit/harmony.testing.create-aspect';

describe('LanesAspect', () => {
  it('should list all lanes', async () => {
    const lanes: LanesMain = await createAspect(LanesAspect, '/Users/ranmizrahi/Bit/temp-dir');
    const currentLanes = await lanes.getLanes([]);
    console.log(currentLanes);
    expect({}).to.eq(currentLanes);
  });
});
