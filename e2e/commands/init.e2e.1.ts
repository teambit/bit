import chai, { expect } from 'chai';
import detectIndent from 'detect-indent';
import fs from 'fs-extra';
import * as path from 'path';
import { CURRENT_BITMAP_SCHEMA, SCHEMA_FIELD, InvalidBitMap } from '@teambit/legacy.bit-map';
import { BIT_GIT_DIR, BIT_HIDDEN_DIR, BIT_MAP } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-fs'));

describe('run bit init', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('running bit init with path', () => {
    before(() => {
      helper.scopeHelper.cleanWorkspace();
      helper.command.runCmd('bit init my-dir');
    });
    it('should init Bit at that path', () => {
      expect(path.join(helper.scopes.localPath, 'my-dir/workspace.jsonc')).to.be.a.file();
    });
  });
  describe('automatic bit init when .bit.map.json already exists', () => {
    beforeEach(() => {
      helper.scopeHelper.reInitWorkspace();
    });
    before(() => {
      helper.bitMap.createHarmony();
    });
    it('should not tell you there is already a scope when running "bit init"', () => {
      const init = helper.command.init();
      expect(init).to.have.string('successfully initialized a bit workspace.');
    });
    it('should create bitmap"', () => {
      const bitmapPath = path.join(helper.scopes.localPath, '.bitmap');
      expect(bitmapPath).to.be.a.file('missing bitmap');
    });
    it('bitmap should contain version"', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(SCHEMA_FIELD);
      expect(bitMap[SCHEMA_FIELD]).to.equal(CURRENT_BITMAP_SCHEMA);
    });
  });
  describe('init .bit ', () => {
    describe('when .git exists and bit already initialized with .bit ', () => {
      it('should not create bit inside .git', () => {
        helper.scopeHelper.reInitWorkspace();
        helper.git.initNewGitRepo();
        helper.command.init();
        expect(path.join(helper.scopes.local, '.git', 'bit')).to.not.be.a.path('bit dir is missing');
      });
    });
  });
  describe('git integration', () => {
    describe('when .git exists', () => {
      let gitFolder;
      // let gitHooksFolder;
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.git.initNewGitRepo();
        helper.command.init();
        gitFolder = path.join(helper.scopes.localPath, '.git');
        // gitHooksFolder = path.join(gitFolder, 'hooks');
      });

      it('should nest the bit folder inside .git by default', () => {
        const gitScopeDir = path.join(gitFolder, BIT_GIT_DIR);
        const scopeDir = path.join(helper.scopes.localPath, BIT_HIDDEN_DIR);
        expect(gitScopeDir).to.be.a.directory('bit dir is missing');
        // Use not.be.a.path instead of to.not.be.a.directory since for some reason it's not working
        expect(scopeDir).not.be.a.path('bit dir created not in the .git folder');
      });
      it('should not nest the bit folder inside .git if --standalone provided', () => {
        helper.scopeHelper.cleanWorkspace();
        helper.git.initNewGitRepo();
        helper.command.init('--standalone');
        const gitScopeDir = path.join(gitFolder, BIT_GIT_DIR);
        const scopeDir = path.join(helper.scopes.localPath, BIT_HIDDEN_DIR);
        expect(scopeDir).to.be.a.directory('bit dir is missing');
        // Use not.be.a.path instead of to.not.be.a.directory since for some reason it's not working
        expect(gitScopeDir).not.be.a.path('bit dir created incorrectly (in .git folder)');
      });
    });
  });
  describe('when scope.json is missing', () => {
    let scopeJsonPath;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      scopeJsonPath = path.join(helper.scopes.localPath, '.bit/scope.json');
      fs.removeSync(scopeJsonPath);
    });
    describe('running bit init', () => {
      let output;
      before(() => {
        output = helper.command.init();
      });
      it('should show a success message', () => {
        expect(output).to.have.string('successfully initialized');
      });
      it('should recreate scope.json file', () => {
        expect(scopeJsonPath).to.be.a.file();
      });
    });
  });
  describe('bit init --reset', () => {
    describe('when bitMap file is invalid', () => {
      let bitMapPath;
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        const invalidBitMap = 'this is an invalid json';
        bitMapPath = path.join(helper.scopes.localPath, BIT_MAP);
        fs.outputFileSync(bitMapPath, invalidBitMap);
      });
      it('bit status should throw an exception InvalidBitMap', () => {
        const statusCmd = () => helper.command.runCmd('bit status');
        const error = new InvalidBitMap(bitMapPath, 'Unexpected token t');
        helper.general.expectToThrow(statusCmd, error);
      });
      it('should create a new bitMap file', () => {
        helper.command.runCmd('bit init --reset');
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(SCHEMA_FIELD);
      });
    });
    describe('when workspace.jsonc file is invalid', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.workspaceJsonc.corrupt();
      });
      it('bit status should throw a descriptive error', () => {
        const statusCmd = () => helper.command.runCmd('bit status');
        expect(statusCmd).to.throw('failed parsing the workspace.jsonc file at');
      });
    });
  });
  describe('an existing environment with model and with modified bitMap', () => {
    let localScope;
    let bitMap;
    let localConsumerFiles;
    const filter = (file: string) => !file.includes('bitmap-history') && !file.includes('workspace-config-history');
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo(); // this modifies bitMap
      helper.command.tagAllWithoutBuild(); // this creates objects in .bit dir

      bitMap = helper.bitMap.read();
      localConsumerFiles = helper.fs.getConsumerFiles('*', true).filter(filter);
      localScope = helper.scopeHelper.cloneWorkspace();
    });
    describe('bit init', () => {
      before(() => {
        helper.command.init('--no-package-json');
      });
      it('should not change BitMap file', () => {
        const currentBitMap = helper.bitMap.read();
        expect(currentBitMap).to.be.deep.equal(bitMap);
        expect(currentBitMap).to.have.property('bar/foo');
      });
      it('should not change .bit directory', () => {
        const currentFiles = helper.fs.getConsumerFiles('*', true).filter(filter);
        expect(currentFiles).to.be.deep.equal(localConsumerFiles);
      });
    });
    describe('bit init --reset', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.command.runCmd('bit init --reset --no-package-json');
      });
      it('should not change BitMap file', () => {
        const currentBitMap = helper.bitMap.read();
        expect(currentBitMap).to.be.deep.equal(bitMap);
        expect(currentBitMap).to.have.property('bar/foo');
      });
      it('should not change .bit directory', () => {
        const currentFiles = helper.fs.getConsumerFiles('*', true).filter(filter);
        expect(currentFiles).to.be.deep.equal(localConsumerFiles);
      });
    });
    describe('bit init --reset-hard', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.command.runCmd('bit init --reset-hard');
      });
      it('should recreate the BitMap file', () => {
        const currentBitMap = helper.bitMap.read();
        expect(currentBitMap).to.not.be.deep.equal(bitMap);
        expect(currentBitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should recreate .bit directory', () => {
        const currentFiles = helper.fs.getConsumerFiles('*', true);
        expect(currentFiles).to.not.be.deep.equal(localConsumerFiles);
      });
      it('.bit/objects directory should be empty', () => {
        const objectsDir = path.join(helper.scopes.localPath, '.bit', 'objects');
        expect(objectsDir).to.be.a.directory().and.empty;
      });
      it('should not delete the user files', () => {
        expect(path.join(helper.scopes.localPath, 'bar/foo.js')).to.be.a.file();
      });
      it('bit status should show nothing-to-tag', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('when a project has package.json file', () => {
    describe('without --standalone flag', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.npm.initNpm();
        helper.command.init();
      });
      it('should preserve the default npm indentation of 2', () => {
        const packageJson = helper.fs.readFile('package.json');
        expect(detectIndent(packageJson).amount).to.equal(2);
      });
      it('should preserve the new line at the end of json as it was created by npm', () => {
        const packageJson = helper.fs.readFile('package.json');
        expect(packageJson.endsWith('\n')).to.be.true;
      });
    });
    describe('with --standalone flag', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.npm.initNpm();
        helper.command.runCmd('bit init --standalone');
      });
      it('should not write the "bit" prop into the package.json file', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.not.have.property('bit');
      });
      it('should create workspace.jsonc file', () => {
        expect(path.join(helper.scopes.localPath, 'workspace.jsonc')).to.be.a.file();
      });
    });
    describe('with an indentation of 4', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.npm.initNpm();
        const packageJson = helper.packageJson.read();
        const packageJsonPath = path.join(helper.scopes.localPath, 'package.json');
        fs.writeJSONSync(packageJsonPath, packageJson, { spaces: 4 });
        helper.command.init();
      });
      it('should preserve the original indentation and keep it as 4', () => {
        const packageJson = helper.fs.readFile('package.json');
        expect(detectIndent(packageJson).amount).to.equal(4);
      });
    });
  });
  describe('when there is .bitmap, bit.json but not .bit dir', () => {
    describe('when .bit located directly on workspace root', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.bitMap.createHarmony();
        helper.fs.deletePath('.bit');
      });
      it('bit ls (or any other command) should not throw an error and should rebuild .bit dir', () => {
        const lsCmd = () => helper.command.listLocalScope();
        expect(lsCmd).to.not.throw();
        expect(path.join(helper.scopes.localPath, '.bit')).to.be.a.directory();
      });
    });
    describe('when bit located on .git', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.git.initNewGitRepo();
        helper.command.init();
        helper.bitMap.createHarmony();
        helper.fs.deletePath('.git/bit');
      });
      it('bit ls (or any other command) should not throw an error and should rebuild .bit dir', () => {
        const lsCmd = () => helper.command.listLocalScope();
        expect(lsCmd).to.not.throw();
        expect(path.join(helper.scopes.localPath, '.git/bit')).to.be.a.directory();
      });
    });
  });
  describe('external package manager mode', () => {
    describe('bit init --external-package-manager', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.command.init('--external-package-manager');
      });
      it('should set externalPackageManager to true in workspace config', () => {
        const workspaceConfig = helper.workspaceJsonc.read();
        expect(workspaceConfig['teambit.workspace/workspace']).to.have.property('externalPackageManager', true);
      });
      it('should set rootComponent to false in dependency-resolver config', () => {
        const workspaceConfig = helper.workspaceJsonc.read();
        expect(workspaceConfig['teambit.dependencies/dependency-resolver']).to.have.property('rootComponent', false);
      });
      it('should set enableWorkspaceConfigWrite to false', () => {
        const workspaceConfig = helper.workspaceJsonc.read();
        expect(workspaceConfig['teambit.workspace/workspace-config-files']).to.have.property(
          'enableWorkspaceConfigWrite',
          false
        );
      });
      it('should create package.json with type module', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.have.property('type', 'module');
      });
      it('should create package.json with postinstall script', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.have.property('scripts');
        expect(packageJson.scripts).to.have.property('postinstall', 'bit link && bit compile');
      });
    });
    describe('bit install in external package manager mode', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.command.init('--external-package-manager');
      });
      it('should throw error when answering no to prompt', () => {
        const installCmd = () => helper.command.runCmd('echo "n" | bit install');
        expect(installCmd).to.throw();
      });
      it('should switch to Bit package manager when answering yes to prompt', () => {
        // Reset to external PM mode with existing package.json
        helper.scopeHelper.cleanWorkspace();
        const existingPackageJson = {
          name: 'test-project',
          version: '1.0.0',
          scripts: {
            start: 'node index.js',
          },
        };
        helper.packageJson.write(existingPackageJson);
        helper.command.init('--external-package-manager');

        // Verify initial external PM state
        const workspaceConfig = helper.workspaceJsonc.read();
        expect(workspaceConfig['teambit.workspace/workspace']).to.have.property('externalPackageManager', true);
        expect(workspaceConfig['teambit.dependencies/dependency-resolver']).to.have.property('rootComponent', false);

        const packageJson = helper.packageJson.read();
        expect(packageJson.scripts).to.have.property('postinstall', 'bit link && bit compile');

        // Test answering 'yes' to switch to Bit package manager
        const output = helper.command.runCmd('echo "y" | bit install');
        expect(output).to.have.string('Successfully switched to Bit package manager mode');

        // Verify the workspace is now in normal Bit PM mode
        const updatedConfig = helper.workspaceJsonc.read();
        expect(updatedConfig['teambit.workspace/workspace']).to.not.have.property('externalPackageManager');
        expect(updatedConfig['teambit.dependencies/dependency-resolver']).to.have.property('rootComponent', true);
        expect(updatedConfig['teambit.workspace/workspace-config-files']).to.have.property(
          'enableWorkspaceConfigWrite',
          true
        );

        // Verify postinstall script was removed but user scripts preserved
        const updatedPackageJson = helper.packageJson.read();
        expect(updatedPackageJson.scripts).to.have.property('start', 'node index.js');
        expect(updatedPackageJson.scripts).to.not.have.property('postinstall');
      });
    });
    describe('validation of conflicting settings', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.command.init('--external-package-manager');
      });
      it('should throw error when manually setting rootComponent to true', () => {
        const workspaceConfig = helper.workspaceJsonc.read();
        workspaceConfig['teambit.dependencies/dependency-resolver'].rootComponent = true;
        helper.workspaceJsonc.write(workspaceConfig);

        const statusCmd = () => helper.command.runCmd('bit status');
        expect(statusCmd).to.throw('rootComponent cannot be true when externalPackageManager is enabled');
      });
      it('should throw error when manually setting enableWorkspaceConfigWrite to true', () => {
        // Reset to clean state
        helper.scopeHelper.cleanWorkspace();
        helper.command.init('--external-package-manager');

        const workspaceConfig = helper.workspaceJsonc.read();
        workspaceConfig['teambit.workspace/workspace-config-files'].enableWorkspaceConfigWrite = true;
        helper.workspaceJsonc.write(workspaceConfig);

        const statusCmd = () => helper.command.runCmd('bit status');
        expect(statusCmd).to.throw('enableWorkspaceConfigWrite cannot be true when externalPackageManager is enabled');
      });
    });
    describe('preserving existing package.json', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        // Create package.json with existing scripts
        const existingPackageJson = {
          name: 'my-project',
          version: '1.0.0',
          scripts: {
            start: 'node index.js',
            build: 'webpack',
          },
        };
        helper.packageJson.write(existingPackageJson);
        helper.command.init('--external-package-manager');
      });
      it('should preserve existing package.json properties', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.have.property('name', 'my-project');
        expect(packageJson).to.have.property('version', '1.0.0');
      });
      it('should preserve existing scripts and add postinstall', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson.scripts).to.have.property('start', 'node index.js');
        expect(packageJson.scripts).to.have.property('build', 'webpack');
        expect(packageJson.scripts).to.have.property('postinstall', 'bit link && bit compile');
      });
      it('should add type module to existing package.json', () => {
        const packageJson = helper.packageJson.read();
        expect(packageJson).to.have.property('type', 'module');
      });
    });
    describe('disabling external package manager mode', () => {
      before(() => {
        helper.scopeHelper.cleanWorkspace();
        helper.command.init('--external-package-manager');
      });
      it('should revert to normal mode when externalPackageManager is removed', () => {
        // Simulate what happens when user chooses 'yes' to switch back to Bit PM
        const workspaceConfig = helper.workspaceJsonc.read();

        // Remove externalPackageManager flag
        delete workspaceConfig['teambit.workspace/workspace'].externalPackageManager;

        // Restore settings
        workspaceConfig['teambit.dependencies/dependency-resolver'].rootComponent = true;
        workspaceConfig['teambit.workspace/workspace-config-files'].enableWorkspaceConfigWrite = true;

        helper.workspaceJsonc.write(workspaceConfig);

        // Remove postinstall script from package.json
        const packageJson = helper.packageJson.read();
        delete packageJson.scripts.postinstall;
        if (Object.keys(packageJson.scripts).length === 0) {
          delete packageJson.scripts;
        }
        helper.packageJson.write(packageJson);

        // Verify configuration is back to normal
        const updatedConfig = helper.workspaceJsonc.read();
        expect(updatedConfig['teambit.workspace/workspace']).to.not.have.property('externalPackageManager');
        expect(updatedConfig['teambit.dependencies/dependency-resolver']).to.have.property('rootComponent', true);
        expect(updatedConfig['teambit.workspace/workspace-config-files']).to.have.property(
          'enableWorkspaceConfigWrite',
          true
        );

        // Verify postinstall script is removed
        const updatedPackageJson = helper.packageJson.read();
        expect(updatedPackageJson).to.not.have.property('scripts');
      });
      it('should preserve user scripts when removing postinstall', () => {
        // Reset and create scenario with user scripts
        helper.scopeHelper.cleanWorkspace();
        const existingPackageJson = {
          name: 'my-project',
          scripts: {
            start: 'node index.js',
            test: 'jest',
          },
        };
        helper.packageJson.write(existingPackageJson);
        helper.command.init('--external-package-manager');

        // Verify postinstall was added
        const packageJson = helper.packageJson.read();
        expect(packageJson.scripts).to.have.property('postinstall', 'bit link && bit compile');

        // Simulate removing only our postinstall script
        delete packageJson.scripts.postinstall;
        helper.packageJson.write(packageJson);

        // Verify user scripts are preserved
        const finalPackageJson = helper.packageJson.read();
        expect(finalPackageJson.scripts).to.have.property('start', 'node index.js');
        expect(finalPackageJson.scripts).to.have.property('test', 'jest');
        expect(finalPackageJson.scripts).to.not.have.property('postinstall');
      });
    });
  });
});
