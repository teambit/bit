import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs-extra';
import path from 'path';
import { PassThrough } from 'stream';
import stripAnsi from 'strip-ansi';
import { parse } from 'comment-json';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { HostInitializerMain, EXTERNAL_PM_POSTINSTALL_SCRIPT } from '@teambit/host-initializer';
import type { InstallMain } from './install.main.runtime';
import { InstallAspect } from './install.aspect';

const DEP_RESOLVER_ID = 'teambit.dependencies/dependency-resolver';
const WS_CONFIG_FILES_ID = 'teambit.workspace/workspace-config-files';

type InstallWithPrompt = {
  handleExternalPackageManagerPrompt(): Promise<void>;
  logger: { console(message: string): void };
};

/**
 * "bit install" in a workspace that was initialized with --external-package-manager: it asks whether to
 * switch to Bit's package manager. the prompt is the first thing "bit install" does in that mode, and
 * it's all that's covered here. what follows it is the regular installation.
 */
describe('bit install in external package manager mode', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let consoleOutput: string[];

  const readJsonc = (file: string): Record<string, any> =>
    parse(fs.readFileSync(path.join(workspaceData.workspacePath, file), 'utf8')) as Record<string, any>;
  const readPackageJson = () => fs.readJsonSync(path.join(workspaceData.workspacePath, 'package.json'));

  /** the same as `bit init --external-package-manager` in an empty directory */
  async function initExternalPackageManager({ keepFiles = false } = {}) {
    if (!keepFiles) fs.emptyDirSync(workspaceData.workspacePath);
    await HostInitializerMain.init(
      workspaceData.workspacePath,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      { defaultDirectory: 'bit-components/{scope}/{name}', externalPackageManager: true } as any,
      undefined,
      undefined,
      { skipDefaultMcp: true, skipAgentInstructions: true }
    );
  }

  /** yesno reads the answer from stdin */
  function answerPromptWith(answer: string) {
    const input = new PassThrough();
    input.end(`${answer}\n`);
    sinon.stub(process, 'stdin').get(() => input);
  }

  async function promptFor(): Promise<void> {
    const install = await loadAspect<InstallMain>(InstallAspect, workspaceData.workspacePath);
    const installWithPrompt = install as unknown as InstallWithPrompt;
    sinon.stub(installWithPrompt.logger, 'console').callsFake((message: string) => {
      consoleOutput.push(stripAnsi(message));
    });
    // reaching the private method directly, otherwise a "yes" goes on to run a real installation
    await installWithPrompt.handleExternalPackageManagerPrompt();
  }

  before(() => {
    workspaceData = mockWorkspace();
  });
  beforeEach(() => {
    consoleOutput = [];
  });
  afterEach(() => {
    sinon.restore();
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  it('should throw error when answering no to prompt', async () => {
    await initExternalPackageManager();
    answerPromptWith('n');
    let error: Error | undefined;
    try {
      await promptFor();
    } catch (err: any) {
      error = err;
    }
    if (!error) throw new Error('expected the prompt to throw when answering no');
    expect(error.message).to.have.string('External package manager mode is enabled');
  });

  it('should switch to Bit package manager when answering yes to prompt', async () => {
    // external PM mode with an existing package.json
    fs.emptyDirSync(workspaceData.workspacePath);
    fs.writeJsonSync(
      path.join(workspaceData.workspacePath, 'package.json'),
      { name: 'test-project', version: '1.0.0', scripts: { start: 'node index.js' } },
      { spaces: 2 }
    );
    await initExternalPackageManager({ keepFiles: true });

    // verify initial external PM state
    const workspaceConfig = readJsonc('workspace.jsonc');
    expect(workspaceConfig[DEP_RESOLVER_ID]).to.have.property('externalPackageManager', true);
    expect(workspaceConfig[DEP_RESOLVER_ID]).to.have.property('rootComponent', false);

    const packageJson = readPackageJson();
    expect(packageJson.scripts).to.have.property('postinstall', EXTERNAL_PM_POSTINSTALL_SCRIPT);

    // test answering 'yes' to switch to Bit package manager
    answerPromptWith('y');
    await promptFor();
    expect(consoleOutput.join('\n')).to.have.string('Successfully switched to Bit package manager mode');

    // verify the workspace is now in normal Bit PM mode
    const updatedConfig = readJsonc('workspace.jsonc');
    expect(updatedConfig[DEP_RESOLVER_ID]).to.not.have.property('externalPackageManager');
    expect(updatedConfig[DEP_RESOLVER_ID]).to.have.property('rootComponent', true);
    expect(updatedConfig[WS_CONFIG_FILES_ID]).to.have.property('enableWorkspaceConfigWrite', true);

    // verify postinstall script was removed but user scripts preserved
    const updatedPackageJson = readPackageJson();
    expect(updatedPackageJson.scripts).to.have.property('start', 'node index.js');
    expect(updatedPackageJson.scripts).to.not.have.property('postinstall');
  });
});
