import chai, { expect } from 'chai';
import path from 'path';
import format from 'string-format';
import Helper, { INTERACTIVE_KEYS } from '../e2e-helper';
import {
  DEFAULT_DIR_MSG_Q,
  PACKAGE_MANAGER_MSG_Q,
  DEFAULT_ENV_MSG_TEMPLATE_Q,
  CHOOSE_COMPILER_MSG_Q,
  CHOOSE_TESTER_MSG_Q,
  CHOOSE_ENV_SCOPE_MSG_Q
} from '../../src/interactive/commands/init-interactive';
import { CFG_INIT_INTERACTIVE, CFG_INTERACTIVE } from '../../src/constants';

const DEFAULT_COMPILER_MSG_Q = format(DEFAULT_ENV_MSG_TEMPLATE_Q, { type: 'compiler' });
const DEFAULT_TESTER_MSG_Q = format(DEFAULT_ENV_MSG_TEMPLATE_Q, { type: 'tester' });

const assertArrays = require('chai-arrays');

chai.use(assertArrays);
chai.use(require('chai-fs'));

describe('run bit init - interactive', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with defaults', () => {
    let output;
    before(async () => {
      helper.cleanLocalScope();
      output = await helper.initInteractive(inputsWithDefaultsNoCompilerNoTester);
    });
    it('should prompt about default directory', () => {
      expect(output).to.have.string(DEFAULT_DIR_MSG_Q);
    });
    it('should prompt about package manager', () => {
      expect(output).to.have.string(PACKAGE_MANAGER_MSG_Q);
    });
    it('should prompt about compiler', () => {
      expect(output).to.have.string(DEFAULT_COMPILER_MSG_Q);
    });
    it('should prompt about tester', () => {
      expect(output).to.have.string(DEFAULT_TESTER_MSG_Q);
    });
    it('should init a new scope with provided inputs from the user', () => {
      expect(output).to.have.string('successfully initialized a bit workspace');
      const bitmapPath = path.join(helper.localScopePath, '.bitmap');
      expect(bitmapPath).to.be.a.file('missing bitmap');
      const bitJson = helper.readBitJson();
      expect(bitJson.componentsDefaultDirectory).to.equal('components/{name}');
      expect(bitJson.packageManager).to.equal('npm');
      expect(bitJson.env).to.be.empty;
    });
  });
  describe('change dir, use yarn, set compiler and testers from bit.envs', () => {
    let bitJson;
    before(async () => {
      helper.cleanLocalScope();
      helper.createNewDirectoryInLocalWorkspace('my-comps');
      const inputs = [
        { triggerText: DEFAULT_DIR_MSG_Q, inputs: [{ value: 'my-comps' }, { value: INTERACTIVE_KEYS.enter }] },
        {
          triggerText: PACKAGE_MANAGER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: DEFAULT_COMPILER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: CHOOSE_COMPILER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: DEFAULT_TESTER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: CHOOSE_TESTER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        }
      ];
      await helper.initInteractive(inputs);
      bitJson = helper.readBitJson();
    });
    it('should set the default dir to my-comps', () => {
      expect(bitJson.componentsDefaultDirectory).to.equal('my-comps/{name}');
    });
    it('should set the package manager to yarn', () => {
      expect(bitJson.packageManager).to.equal('yarn');
    });
    it('should set the compiler to compiler from bit.envs', () => {
      expect(bitJson.env.compiler).to.have.string('bit.envs');
    });
    it('should set the tester to tester from bit.envs', () => {
      expect(bitJson.env.tester).to.have.string('bit.envs');
    });
  });
  describe('use compiler and tester from custom scope', () => {
    let bitJson;
    before(async () => {
      helper.reInitLocalScope();
      helper.createDummyCompiler();
      // We adding the remote scope as global because we need it to be identified on a clean folder during the init process
      // (it will be delete few lines below right after the init)
      helper.addRemoteEnvironment(true);
      helper.cleanLocalScope();
      const inputs = [
        { triggerText: DEFAULT_DIR_MSG_Q, inputs: [{ value: INTERACTIVE_KEYS.enter }] },
        {
          triggerText: PACKAGE_MANAGER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: DEFAULT_COMPILER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: CHOOSE_ENV_SCOPE_MSG_Q,
          inputs: [{ value: helper.envScope }, { value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: CHOOSE_COMPILER_MSG_Q,
          // Select the first value from the env scope
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: DEFAULT_TESTER_MSG_Q,
          inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: CHOOSE_ENV_SCOPE_MSG_Q,
          inputs: [{ value: helper.envScope }, { value: INTERACTIVE_KEYS.enter }]
        },
        {
          triggerText: CHOOSE_TESTER_MSG_Q,
          // Select the first value from the env scope - it will be the same as the compiler but it doesn't really matter for the testing
          inputs: [{ value: INTERACTIVE_KEYS.enter }]
        }
      ];
      await helper.initInteractive(inputs);
      helper.removeRemoteEnvironment(true);
      bitJson = helper.readBitJson();
    });
    it('should set the compiler to compiler from bit.envs', () => {
      expect(bitJson.env.compiler).to.have.string(helper.envScope);
    });
    it('should set the tester to tester from bit.envs', () => {
      expect(bitJson.env.tester).to.have.string(helper.envScope);
    });
  });
  describe('interactive global configs', () => {
    let configsBackup;
    before(() => {
      // Backup the user config because they are global, we will restore them in the end
      configsBackup = helper.backupConfigs([CFG_INTERACTIVE, CFG_INIT_INTERACTIVE]);
    });
    beforeEach(() => {
      helper.cleanLocalScope();
      helper.delConfig(CFG_INTERACTIVE);
      helper.delConfig(CFG_INIT_INTERACTIVE);
    });
    after(() => {
      helper.restoreConfigs(configsBackup);
    });
    it('should prefer interactive.init config over interactive config', async () => {
      helper.setConfig(CFG_INTERACTIVE, true);
      helper.setConfig(CFG_INIT_INTERACTIVE, false);
      const output = await helper.initInteractive([]);
      // We didn't enter anything to the interactive but we don't expect to have it so the workspace should be initialized
      expect(output).to.have.string('successfully initialized');
    });
    it('should should not show interactive when interactive config set to false', async () => {
      helper.setConfig(CFG_INTERACTIVE, false);
      const output = await helper.initInteractive([]);
      // We didn't enter anything to the interactive but we don't expect to have it so the workspace should be initialized
      expect(output).to.have.string('successfully initialized');
    });
    it('should should show interactive by default', async () => {
      const output = await helper.initInteractive(inputsWithDefaultsNoCompilerNoTester);
      // We don't enter anything we just want to see that any question has been asked
      expect(output).to.have.string(DEFAULT_DIR_MSG_Q);
    });
  });
});

const inputsWithDefaultsNoCompilerNoTester = [
  { triggerText: DEFAULT_DIR_MSG_Q, inputs: [{ value: INTERACTIVE_KEYS.enter }] },
  { triggerText: PACKAGE_MANAGER_MSG_Q, inputs: [{ value: INTERACTIVE_KEYS.enter }] },
  {
    triggerText: DEFAULT_COMPILER_MSG_Q,
    inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
  },
  {
    triggerText: DEFAULT_TESTER_MSG_Q,
    inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
  }
];
