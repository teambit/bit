import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

// @todo: Olivier
describe.skip('installing in an angular workspace', function () {
  this.timeout(0);
  let helper: Helper;
  let workspaceDir: string;
  function prepare() {
    helper = new Helper();
    helper.command.new('ng-workspace', '--aspect=teambit.angular/angular');
    workspaceDir = path.join(helper.scopes.localPath, 'my-workspace');
    helper.command.create('ng-module', 'ui/my-button', undefined, workspaceDir);
  }
  describe('using yarn', function () {
    before(prepare);
    it('installation should work', () => {
      helper.command.install(undefined, undefined, workspaceDir);
    });
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // TODO: test the same with pnpm
});
