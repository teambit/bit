import chai, { expect } from 'chai';
import path from 'path';
import Helper, { INTERACTIVE_KEYS } from '../../src/e2e-helper/e2e-helper';
import {
  DEFAULT_DIR_MSG_Q,
  PACKAGE_MANAGER_MSG_Q,
  CHOOSE_COMPILER_MSG_Q,
  CHOOSE_CUSTOM_COMPILER_MSG_Q
} from '../../src/interactive/commands/init-interactive';
import { CFG_INIT_INTERACTIVE, CFG_INTERACTIVE, IS_WINDOWS } from '../../src/constants';

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
    // Skip on windows since the interactive keys are not working on windows
    if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
      let output;
      before(async () => {
        helper.cleanLocalScope();
        output = await helper.initInteractive(inputsWithDefaultsNoCompiler);
      });
      it('should prompt about package manager', () => {
        expect(output).to.have.string(PACKAGE_MANAGER_MSG_Q);
      });
      it('should prompt about default directory', () => {
        expect(output).to.have.string(DEFAULT_DIR_MSG_Q);
      });
      it('should prompt about compiler', () => {
        expect(output).to.have.string(CHOOSE_COMPILER_MSG_Q);
      });
      it('should init a new scope with provided inputs from the user', () => {
        expect(output).to.have.string('successfully initialized a bit workspace');
        const bitmapPath = path.join(helper.localScopePath, '.bitmap');
        expect(bitmapPath).to.be.a.file('missing bitmap');
        const bitJson = helper.bitJson.readBitJson();
        expect(bitJson.packageManager).to.equal('npm');
        expect(bitJson.componentsDefaultDirectory).to.equal('components/{name}');
        expect(bitJson.env).to.be.empty;
      });
    }
  });
  describe('change dir, use yarn, set compiler from bit.envs', () => {
    // Skip on windows since the interactive keys are not working on windows
    if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
      let bitJson;
      before(async () => {
        helper.cleanLocalScope();
        helper.createNewDirectoryInLocalWorkspace('my-comps');
        const inputs = [
          {
            triggerText: PACKAGE_MANAGER_MSG_Q,
            inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
          },
          { triggerText: DEFAULT_DIR_MSG_Q, inputs: [{ value: 'my-comps' }, { value: INTERACTIVE_KEYS.enter }] },
          {
            triggerText: CHOOSE_COMPILER_MSG_Q,
            inputs: [{ value: INTERACTIVE_KEYS.down }, { value: INTERACTIVE_KEYS.enter }]
          }
        ];
        await helper.initInteractive(inputs);
        bitJson = helper.bitJson.readBitJson();
      });
      it('should set the package manager to yarn', () => {
        expect(bitJson.packageManager).to.equal('yarn');
      });
      it('should set the default dir to my-comps', () => {
        expect(bitJson.componentsDefaultDirectory).to.equal('my-comps/{name}');
      });
      it('should set the compiler to compiler from bit.envs', () => {
        expect(bitJson.env.compiler).to.have.string('bit.envs');
      });
    }
  });
  describe('use a custom compiler', () => {
    // Skip on windows since the interactive keys are not working on windows
    if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
      let bitJson;
      const compilerName = 'my-compiler';
      before(async () => {
        // helper.reInitLocalScope();
        // helper.createDummyCompiler();
        // We adding the remote scope as global because we need it to be identified on a clean folder during the init process
        // (it will be delete few lines below right after the init)
        // helper.addRemoteEnvironment(true);
        helper.cleanLocalScope();
        const inputs = [
          {
            triggerText: PACKAGE_MANAGER_MSG_Q,
            inputs: [{ value: INTERACTIVE_KEYS.enter }]
          },
          { triggerText: DEFAULT_DIR_MSG_Q, inputs: [{ value: INTERACTIVE_KEYS.enter }] },
          {
            triggerText: CHOOSE_COMPILER_MSG_Q,
            inputs: [{ value: INTERACTIVE_KEYS.up }, { value: INTERACTIVE_KEYS.enter }]
          },
          {
            triggerText: CHOOSE_CUSTOM_COMPILER_MSG_Q,
            inputs: [{ value: `bit import ${compilerName}` }, { value: INTERACTIVE_KEYS.enter }]
          }
        ];
        await helper.initInteractive(inputs);
        // helper.removeRemoteEnvironment(true);
        bitJson = helper.bitJson.readBitJson();
      });
      it('should set the compiler entered by the user without the "bit import" prefix', () => {
        expect(bitJson.env.compiler).to.equal(compilerName);
      });
    }
  });
  describe('interactive global configs', () => {
    // Skip on windows since the interactive keys are not working on windows
    if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
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
        const output = helper.initWorkspace();
        // We didn't enter anything to the interactive but we don't expect to have it so the workspace should be initialized
        expect(output).to.have.string('successfully initialized');
      });
      it('should should show interactive when interactive config set to true', async () => {
        helper.setConfig(CFG_INTERACTIVE, true);
        const output = helper.initWorkspace();
        // We don't enter anything we just want to see that any question has been asked
        expect(output).to.have.string(PACKAGE_MANAGER_MSG_Q);
      });
      it('should not show interactive by default', async () => {
        helper.delConfig(CFG_INTERACTIVE);
        helper.delConfig(CFG_INIT_INTERACTIVE);
        const output = helper.initWorkspace();
        expect(output).to.have.string('successfully initialized');
      });
    }
  });
});

const inputsWithDefaultsNoCompiler = [
  { triggerText: PACKAGE_MANAGER_MSG_Q, inputs: [{ value: INTERACTIVE_KEYS.enter }] },
  { triggerText: DEFAULT_DIR_MSG_Q, inputs: [{ value: INTERACTIVE_KEYS.enter }] },
  {
    triggerText: CHOOSE_COMPILER_MSG_Q,
    inputs: [{ value: INTERACTIVE_KEYS.enter }]
  }
];
