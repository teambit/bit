import fs from 'fs-extra';
import { expect } from 'chai';
import path from 'path';
import { fileURLToPath } from 'url';
import { Helper } from '@teambit/legacy.e2e-helper';

/** this file lives at <repo>/e2e/harmony */
// @ts-ignore
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * the versions of the given typings packages that the running bit repo itself resolves. Read at
 * runtime rather than pinned here, so a repo-side bump does not silently put this suite back into
 * the version mismatch it is avoiding.
 */
function typesVersionsOfThisRepo(names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [name, fs.readJsonSync(path.join(repoRoot, 'node_modules', name, 'package.json')).version])
  );
}

/**
 * `enableGlobalVirtualStore` moves the dependency directories out of the workspace's
 * `node_modules/.pnpm` and into a directory shared by every workspace on the machine. Everything a
 * workspace does has to keep working from there - the deps still have to resolve, and the envs still
 * have to find the core aspects they require without declaring them.
 */
describe('installing with the global virtual store', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a workspace with a component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('enableGlobalVirtualStore', true);
      helper.fixtures.populateComponents(1);
      // the default env has no compiler, and the last assertion here is about a dist. a
      // workspace-local env keeps the subject of this suite intact - it installs nothing, so what
      // the global store does or does not serve is still what the assertions measure.
      helper.env.setTsEnv();
      helper.command.install('is-positive@1.0.0');
    });
    it('should not create the dependency directories inside the workspace', () => {
      const virtualStoreDir = path.join(helper.scopes.localPath, 'node_modules/.pnpm');
      // dependency directories specifically: metadata files (`lock.yaml`) and pnpm's own
      // entries (`node_modules`, dot-entries) are expected to stay
      const dirs = fs
        .readdirSync(virtualStoreDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map((entry) => entry.name);
      expect(dirs).to.deep.eq([]);
    });
    it('should link the dependency from the global virtual store', () => {
      const depPath = path.join(helper.scopes.localPath, 'node_modules/is-positive');
      // the shared store lives outside the workspace: pnpm's own `<storeDir>/links` root
      const realPath = fs.realpathSync(depPath);
      expect(realPath).to.match(/[\\/]links[\\/]/);
      expect(realPath).to.not.have.string(helper.scopes.localPath);
    });
    it('should still record the installed dependencies in the current lockfile', () => {
      expect(helper.fs.getVirtualStoreDirNames()).to.include('is-positive@1.0.0');
    });
    it('should load the component without issues', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(0);
    });
    it('should compile the component into its package directory', () => {
      helper.command.compile();
      expect(
        path.join(helper.scopes.localPath, 'node_modules', `@${helper.scopes.remote}/comp1/dist/index.js`)
      ).to.be.a.path();
    });
  });
  describe('building an aspect', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('enableGlobalVirtualStore', true);
      helper.workspaceJsonc.disablePreview();
      helper.fixtures.populateExtensions(1);
      helper.extensions.addExtensionToVariant('extensions', 'teambit.harmony/aspect');
      // the aspect env pins older typings than this repo uses (@types/react@17 against its 19).
      // The bridge maps the program's `react` to whatever the workspace hoisted, which is right
      // for the workspace's own packages - but bit's sources share that program, because a core
      // aspect in the dev repo exposes `types: index.ts`, and they need the repo's typings. The
      // mismatch fails the compile for reasons that have nothing to do with reachability, which
      // is what this suite measures. Align the workspace on the repo's versions so the bridge is
      // the only variable left: with it disabled the compile still fails, with 47 errors.
      helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: typesVersionsOfThisRepo(['@types/react', '@types/react-dom', '@types/mime']),
      });
      helper.command.install();
      // throws on a failed build pipeline, which is the assertion: the TSCompiler task is what
      // breaks when the types below cannot be reached
      output = helper.command.tagAllComponents();
    });
    // the compiled program reaches `.d.ts` files that sit in store slots, and those reference
    // types they never declare - `@types/*` for a package that ships none, the core aspects. From
    // a store slot none of it resolves by walking up, and the types quietly degrade into errors
    // that name a prop rather than the cause.
    it('should type-check the aspect against the types a store slot cannot reach by walking up', () => {
      expect(output).to.not.have.string('error TS');
      expect(helper.command.listParsed()).to.have.lengthOf(1);
    });
  });
  describe('patched dependencies', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('enableGlobalVirtualStore', true);
      helper.command.install('is-positive@1.0.0');
      // a patch's context lines are byte-exact, so build it from what was actually installed
      const indexPath = path.join(helper.scopes.localPath, 'node_modules/is-positive/index.js');
      const contents = fs.readFileSync(indexPath, 'utf8');
      const hasTrailingNewline = contents.endsWith('\n');
      const lines = (hasTrailingNewline ? contents.slice(0, -1) : contents).split('\n');
      helper.fs.outputFile(
        'patches/is-positive.patch',
        [
          'diff --git a/index.js b/index.js',
          '--- a/index.js',
          '+++ b/index.js',
          `@@ -1,${lines.length} +1,${lines.length + 1} @@`,
          ` ${lines[0]}`,
          '+// patched',
          ...lines.slice(1).map((line) => ` ${line}`),
          ...(hasTrailingNewline ? [''] : ['\\ No newline at end of file']),
        ].join('\n')
      );
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('patchedDependencies', {
        'is-positive@1.0.0': 'patches/is-positive.patch',
      });
      helper.command.install();
    });
    it('should apply the patch to the copy in the global virtual store', () => {
      const indexPath = path.join(helper.scopes.localPath, 'node_modules/is-positive/index.js');
      expect(fs.readFileSync(indexPath, 'utf8')).to.include('// patched');
    });
  });
});
