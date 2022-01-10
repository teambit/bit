import { Helper } from '@teambit/harmony.testing.helper';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import { LanesAspect } from './lanes.aspect';
import { LanesMain } from './lanes.main.runtime';

describe('LanesAspect', function () {
  let helper: Helper;
  let lanes: LanesMain;
  beforeAll(async () => {
    helper = new Helper();
    helper.setupWorkspace();
    helper.populateComponents();
    lanes = await loadAspect(LanesAspect, helper.workspacePath);
    await lanes.createLane('stage');
  });
  afterAll(() => {
    helper.destroy();
  });
  describe('getLanes()', () => {
    it('should list all lanes', async () => {
      const currentLanes = await lanes.getLanes({});
      expect(currentLanes).toBeDefined();
      expect(currentLanes[0].name).toEqual('stage');
    });
  });
});
