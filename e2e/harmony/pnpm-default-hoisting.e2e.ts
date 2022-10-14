import { expect } from 'chai';
import path from 'path';
import { Modules, read as readModulesState } from '@pnpm/modules-yaml';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('pnpm install with default settings', function () {
  let helper: Helper;
  let modulesState: Modules | null;
  this.timeout(0);
  before(async () => {
    helper = new Helper();
    helper.scopeHelper.reInitLocalScope();
    helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
    helper.command.install('is-positive');
    modulesState = await readModulesState(path.join(helper.fixtures.scopes.localPath, 'node_modules'));
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should run pnpm with hoist-pattern=*', () => {
    expect(modulesState?.hoistPattern).to.deep.eq(['*']);
  });
  it('should run pnpm with public-hoist-pattern set', () => {
    expect(modulesState?.publicHoistPattern?.length).to.be.ok;
  });
});
