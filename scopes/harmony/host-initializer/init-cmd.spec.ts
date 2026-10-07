import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import stripAnsi from 'strip-ansi';
import detectIndent from 'detect-indent';
import { parse, stringify } from 'comment-json';
import { CURRENT_BITMAP_SCHEMA, SCHEMA_FIELD, InvalidBitMap } from '@teambit/legacy.bit-map';
import { BIT_GIT_DIR, BIT_HIDDEN_DIR, BIT_MAP } from '@teambit/legacy.constants';
import { Consumer } from '@teambit/legacy.consumer';
import type { Logger } from '@teambit/logger';
import { InitCmd } from './init-cmd';
import { HostInitializerMain } from './host-initializer.main.runtime';
import { EXTERNAL_PM_POSTINSTALL_SCRIPT } from './create-consumer';

const INTERACTIVE_BANNER = 'Interactive setup for existing Git repository';
const DEP_RESOLVER_ID = 'teambit.dependencies/dependency-resolver';
const WS_CONFIG_FILES_ID = 'teambit.workspace/workspace-config-files';

/**
 * the "bit init" command: its flags, the files it writes and what it does to an existing workspace.
 * HostInitializerMain.init is static and needs no harmony, so everything here runs in-process on a
 * temp directory instead of spawning a "bit" process per command.
 */
describe('bit init command', function () {
  this.timeout(0);

  const tempDirs: string[] = [];
  let consoleOutput: string[];
  let initCmd: InitCmd;

  const newDir = (): string => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bit-init-spec-')));
    tempDirs.push(dir);
    return dir;
  };

  /** the same as `helper.scopeHelper.cleanWorkspace()`: empty the directory but keep it */
  const emptyDir = (dir: string) => fs.emptyDirSync(dir);

  const gitInit = (dir: string) => execSync('git init', { cwd: dir, stdio: 'ignore' });

  /**
   * "bit init" resolves the paths and the scope name against the cwd, which is the workspace when run from
   * a shell. like the e2e helper, it skips the interactive mode unless asked otherwise.
   */
  async function runInit(
    dir: string,
    flags: Record<string, any> = {},
    initPath?: string,
    { interactive = false } = {}
  ): Promise<string> {
    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      const allFlags = interactive ? flags : { skipInteractive: true, ...flags };
      return stripAnsi((await initCmd.report([initPath as string], allFlags)) as string);
    } finally {
      process.chdir(originalCwd);
    }
  }

  const readJsonc = (dir: string, file: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, any>;
  const readBitMap = (dir: string) => readJsonc(dir, BIT_MAP);
  const readWorkspaceJsonc = (dir: string) => readJsonc(dir, 'workspace.jsonc');
  const readPackageJson = (dir: string) => fs.readJsonSync(path.join(dir, 'package.json'));
  const isFile = (filePath: string) => fs.pathExistsSync(filePath) && fs.statSync(filePath).isFile();
  const isDirectory = (dirPath: string) => fs.pathExistsSync(dirPath) && fs.statSync(dirPath).isDirectory();

  /** a harmony .bitmap with one component, as the e2e helper writes it */
  const writeHarmonyBitMap = (dir: string) =>
    fs.writeJsonSync(
      path.join(dir, BIT_MAP),
      {
        version: '0.11.1-testing',
        'bar/foo': { scope: '', version: '', defaultScope: 'my-scope', mainFile: 'bar/foo.js', rootDir: 'bar' },
      },
      { spaces: 2 }
    );

  async function expectToReject(fn: () => Promise<unknown>, messagePart: string) {
    let error: Error | undefined;
    try {
      await fn();
    } catch (err: any) {
      error = err;
    }
    if (!error) throw new Error(`expected the call to throw an error containing "${messagePart}", but it didn't throw`);
    expect(stripAnsi(error.message)).to.have.string(messagePart);
  }

  beforeEach(() => {
    consoleOutput = [];
    const logger = {
      off: () => {},
      console: (message: string) => consoleOutput.push(stripAnsi(message)),
      consoleWarning: (message: string) => consoleOutput.push(stripAnsi(message)),
    } as unknown as Logger;
    initCmd = new InitCmd(new HostInitializerMain(), logger);
  });
  afterEach(() => {
    sinon.restore();
  });
  after(async () => {
    await Promise.all(tempDirs.map((dir) => fs.remove(dir)));
  });

  describe('running bit init with path', () => {
    it('should init Bit at that path', async () => {
      const dir = newDir();
      await runInit(dir, {}, 'my-dir');
      expect(isFile(path.join(dir, 'my-dir/workspace.jsonc'))).to.be.true;
    });
  });

  describe('automatic bit init when .bitmap already exists', () => {
    let dir: string;
    let output: string;
    before(async () => {
      dir = newDir();
      await runInit(dir, { noPackageJson: true });
      writeHarmonyBitMap(dir);
      output = await runInit(dir);
    });
    it('should not tell you there is already a scope when running "bit init"', () => {
      expect(output).to.have.string('successfully re-initialized a bit workspace.');
    });
    it('bitmap should contain version', async () => {
      // the e2e re-initialized the workspace before each test, so this one checks the .bitmap of a fresh init
      const freshDir = newDir();
      await runInit(freshDir, { noPackageJson: true });
      const bitMap = readBitMap(freshDir);
      expect(bitMap).to.have.property(SCHEMA_FIELD);
      expect(bitMap[SCHEMA_FIELD]).to.equal(CURRENT_BITMAP_SCHEMA);
    });
  });

  describe('init .bit', () => {
    describe('when .git exists and bit already initialized with .bit', () => {
      it('should not create bit inside .git', async () => {
        const dir = newDir();
        await runInit(dir, { noPackageJson: true });
        gitInit(dir);
        await runInit(dir);
        expect(fs.pathExistsSync(path.join(dir, '.git', 'bit')), 'bit dir was created inside .git').to.be.false;
      });
    });
  });

  describe('git integration', () => {
    describe('when .git exists', () => {
      let dir: string;
      before(async () => {
        dir = newDir();
        gitInit(dir);
        await runInit(dir);
      });
      it('should nest the bit folder inside .git by default', () => {
        expect(isDirectory(path.join(dir, '.git', BIT_GIT_DIR)), 'bit dir is missing').to.be.true;
        expect(fs.pathExistsSync(path.join(dir, BIT_HIDDEN_DIR)), 'bit dir created not in the .git folder').to.be.false;
      });
      it('should not nest the bit folder inside .git if --standalone provided', async () => {
        emptyDir(dir);
        gitInit(dir);
        await runInit(dir, { standalone: true });
        expect(isDirectory(path.join(dir, BIT_HIDDEN_DIR)), 'bit dir is missing').to.be.true;
        expect(fs.pathExistsSync(path.join(dir, '.git', BIT_GIT_DIR)), 'bit dir created incorrectly (in .git folder)')
          .to.be.false;
      });
    });
  });

  describe('when scope.json is missing', () => {
    let dir: string;
    let scopeJsonPath: string;
    let output: string;
    before(async () => {
      dir = newDir();
      await runInit(dir, { noPackageJson: true });
      scopeJsonPath = path.join(dir, '.bit/scope.json');
      fs.removeSync(scopeJsonPath);
      output = await runInit(dir);
    });
    describe('running bit init', () => {
      it('should show a success message', () => {
        expect(output).to.have.string('successfully re-initialized');
      });
      it('should recreate scope.json file', () => {
        expect(isFile(scopeJsonPath)).to.be.true;
      });
    });
  });

  describe('bit init --reset', () => {
    describe('when bitMap file is invalid', () => {
      let dir: string;
      let bitMapPath: string;
      before(async () => {
        dir = newDir();
        await runInit(dir, { noPackageJson: true });
        bitMapPath = path.join(dir, BIT_MAP);
        fs.outputFileSync(bitMapPath, 'this is an invalid json');
      });
      // "bit status" loads the workspace through Consumer.load, which is where the .bitmap gets parsed
      it('loading the workspace should throw an exception InvalidBitMap', async () => {
        await expectToReject(
          () => Consumer.load(dir),
          // the parser's own message follows, which depends on the node version
          stripAnsi(new InvalidBitMap(bitMapPath, '').message.split('due to an error')[0])
        );
      });
      it('should create a new bitMap file', async () => {
        await runInit(dir, { reset: true });
        const bitMap = readBitMap(dir);
        expect(bitMap).to.have.property(SCHEMA_FIELD);
      });
    });
  });

  describe('when a project has package.json file', () => {
    const writeNpmPackageJson = (dir: string, spaces = 2) =>
      // what "npm init -y" generates
      fs.writeJsonSync(
        path.join(dir, 'package.json'),
        { name: path.basename(dir), version: '1.0.0', main: 'index.js', scripts: { test: 'echo "no test"' } },
        { spaces }
      );

    describe('without --standalone flag', () => {
      let dir: string;
      before(async () => {
        dir = newDir();
        writeNpmPackageJson(dir);
        await runInit(dir);
      });
      it('should preserve the default npm indentation of 2', () => {
        const packageJson = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
        expect(detectIndent(packageJson).amount).to.equal(2);
      });
      it('should preserve the new line at the end of json as it was created by npm', () => {
        const packageJson = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
        expect(packageJson.endsWith('\n')).to.be.true;
      });
    });
    describe('with --standalone flag', () => {
      let dir: string;
      before(async () => {
        dir = newDir();
        writeNpmPackageJson(dir);
        await runInit(dir, { standalone: true });
      });
      it('should not write the "bit" prop into the package.json file', () => {
        expect(readPackageJson(dir)).to.not.have.property('bit');
      });
      it('should create workspace.jsonc file', () => {
        expect(isFile(path.join(dir, 'workspace.jsonc'))).to.be.true;
      });
    });
    describe('with an indentation of 4', () => {
      let dir: string;
      before(async () => {
        dir = newDir();
        writeNpmPackageJson(dir, 4);
        await runInit(dir);
      });
      it('should preserve the original indentation and keep it as 4', () => {
        const packageJson = fs.readFileSync(path.join(dir, 'package.json'), 'utf8');
        expect(detectIndent(packageJson).amount).to.equal(4);
      });
    });
  });

  describe('external package manager mode', () => {
    describe('bit init --external-package-manager', () => {
      let dir: string;
      before(async () => {
        dir = newDir();
        await runInit(dir, { externalPackageManager: true });
      });
      it('should set externalPackageManager to true in dependency-resolver config', () => {
        expect(readWorkspaceJsonc(dir)[DEP_RESOLVER_ID]).to.have.property('externalPackageManager', true);
      });
      it('should set rootComponent to false in dependency-resolver config', () => {
        expect(readWorkspaceJsonc(dir)[DEP_RESOLVER_ID]).to.have.property('rootComponent', false);
      });
      it('should set enableWorkspaceConfigWrite and useDefaultDirectory to true', () => {
        const workspaceConfig = readWorkspaceJsonc(dir);
        expect(workspaceConfig[WS_CONFIG_FILES_ID]).to.have.property('enableWorkspaceConfigWrite', true);
        expect(workspaceConfig[WS_CONFIG_FILES_ID]).to.have.property('useDefaultDirectory', true);
      });
      it('should create package.json with type module', () => {
        expect(readPackageJson(dir)).to.have.property('type', 'module');
      });
      it('should create package.json with postinstall script', () => {
        const packageJson = readPackageJson(dir);
        expect(packageJson).to.have.property('scripts');
        expect(packageJson.scripts).to.have.property('postinstall', EXTERNAL_PM_POSTINSTALL_SCRIPT);
      });
    });

    describe('validation of conflicting settings', () => {
      it('should throw error when manually setting rootComponent to true', async () => {
        const dir = newDir();
        await runInit(dir, { externalPackageManager: true });
        const workspaceConfig = readWorkspaceJsonc(dir);
        workspaceConfig[DEP_RESOLVER_ID].rootComponent = true;
        fs.writeFileSync(path.join(dir, 'workspace.jsonc'), stringify(workspaceConfig, null, 2));

        // "bit status" loads the workspace through Consumer.load, which is where workspace.jsonc gets validated
        await expectToReject(
          () => Consumer.load(dir),
          'rootComponent cannot be true when externalPackageManager is enabled'
        );
      });
    });

    describe('preserving existing package.json', () => {
      let dir: string;
      before(async () => {
        dir = newDir();
        // package.json with existing scripts
        fs.writeJsonSync(
          path.join(dir, 'package.json'),
          { name: 'my-project', version: '1.0.0', scripts: { start: 'node index.js', build: 'webpack' } },
          { spaces: 2 }
        );
        await runInit(dir, { externalPackageManager: true });
      });
      it('should preserve existing package.json properties', () => {
        const packageJson = readPackageJson(dir);
        expect(packageJson).to.have.property('name', 'my-project');
        expect(packageJson).to.have.property('version', '1.0.0');
      });
      it('should preserve existing scripts and add postinstall', () => {
        const packageJson = readPackageJson(dir);
        expect(packageJson.scripts).to.have.property('start', 'node index.js');
        expect(packageJson.scripts).to.have.property('build', 'webpack');
        expect(packageJson.scripts).to.have.property('postinstall', EXTERNAL_PM_POSTINSTALL_SCRIPT);
      });
      it('should not add type module to existing package.json', () => {
        expect(readPackageJson(dir)).to.not.have.property('type');
      });
    });
  });

  describe('interactive mode', () => {
    describe('when git repository exists and workspace is not initialized', () => {
      let dir: string;
      let runInteractiveMode: sinon.SinonStub;
      beforeEach(() => {
        dir = newDir();
        gitInit(dir);
        // the prompts need a TTY. the e2e ran the real prompts with a piped stdin
        runInteractiveMode = sinon.stub(HostInitializerMain, 'runInteractiveMode').resolves({
          externalPackageManager: false,
          defaultDirectory: 'bit-components/{scope}/{name}',
        });
      });

      it('should skip interactive mode with --skip-interactive flag', async () => {
        const output = await runInit(dir, { skipInteractive: true });
        expect(runInteractiveMode.called).to.be.false;
        expect(consoleOutput.join('\n')).to.not.have.string(INTERACTIVE_BANNER);
        expect(output).to.have.string('initialized a bit workspace');
      });

      // each flag is its own key in the bypass guard of handleInteractiveMode, read off an untyped flags
      // record, so a renamed option would silently fall through to the interactive prompt
      it('should skip interactive mode with --external-package-manager and with --standalone', async () => {
        const flagsToCheck: Array<[string, Record<string, any>]> = [
          ['--external-package-manager', { externalPackageManager: true }],
          ['--standalone', { standalone: true }],
        ];
        for (const [index, [flagName, flags]] of flagsToCheck.entries()) {
          if (index > 0) {
            emptyDir(dir);
            gitInit(dir);
          }
          // not skipping the interactive mode by the dedicated flag, only by the one under test
          const output = await runInit(dir, flags, undefined, { interactive: true });
          expect(runInteractiveMode.called, flagName).to.be.false;
          expect(consoleOutput.join('\n'), flagName).to.not.have.string(INTERACTIVE_BANNER);
          expect(output, flagName).to.have.string('initialized a bit workspace');
        }
      });

      it('should run interactive mode by default in git repository', async () => {
        // first verify we have a clean git repo and no existing workspace
        expect(isDirectory(path.join(dir, '.git'))).to.be.true;
        const workspaceJsonc = path.join(dir, 'workspace.jsonc');
        expect(fs.pathExistsSync(workspaceJsonc)).to.be.false;

        // interactive mode is triggered when running bit init in a git repo
        await runInit(dir, {}, undefined, { interactive: true });
        expect(runInteractiveMode.calledOnce).to.be.true;
        expect(consoleOutput.join('\n')).to.have.string(INTERACTIVE_BANNER);
      });

      it('should create the workspace when completing the initialization with --skip-interactive', async () => {
        const workspaceJsonc = path.join(dir, 'workspace.jsonc');
        const finalOutput = await runInit(dir, { skipInteractive: true });
        expect(finalOutput).to.have.string('initialized a bit workspace');
        expect(isFile(workspaceJsonc)).to.be.true;
      });
    });
  });
});
