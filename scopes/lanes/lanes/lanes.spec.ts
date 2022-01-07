import { Helper } from '@teambit/harmony.testing.helper';
import { createAspect } from '@teambit/harmony.testing.create-aspect';
import { LanesAspect } from './lanes.aspect';
import { LanesMain } from './lanes.main.runtime';

describe('LanesAspect', function () {
  let helper: Helper;
  beforeAll(() => {
    helper = new Helper();
    helper.setupWorkspace();
    helper.populateComponents();
    helper.createLane('stage');
  });
  afterAll(() => {
    helper.destroy();
  });
  describe('getLanes()', () => {
    it('should list all lanes', async () => {
      const lanes: LanesMain = await createAspect(LanesAspect, helper.workspacePath);
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).toBeDefined();
      expect(currentLanes[0].name).toEqual('stage');
    });
  });
});
