import { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { Helper } from '@teambit/legacy.e2e-helper';

// `@pnpm/installing.modules-yaml` is ESM in pnpm v11 and can't be `require()`d
// safely from this CJS test file. Read `.modules.yaml` directly instead.
type Modules = { hoistPattern?: string[]; publicHoistPattern?: string[] } & Record<string, unknown>;

async function readModulesManifest(modulesDir: string): Promise<Modules | null> {
  try {
    const raw = await fs.readFile(path.join(modulesDir, '.modules.yaml'), 'utf8');
    return yaml.load(raw) as Modules;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

describe('pnpm install with default settings', function () {
  let helper: Helper;
  let modulesState: Modules | null;
  this.timeout(0);
  before(async () => {
    helper = new Helper();
    helper.scopeHelper.reInitWorkspace();
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
    helper.command.install('is-positive');
    modulesState = await readModulesManifest(path.join(helper.fixtures.scopes.localPath, 'node_modules'));
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
