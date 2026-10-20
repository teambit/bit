import { expect } from 'chai';
import { PackTask } from './pack.task';

const PKG_ASPECT_ID = 'teambit.pkg/pkg';
const componentWithScripts = (scripts?: Record<string, string>) =>
  ({
    state: {
      aspects: {
        get: (id: string) => (id === PKG_ASPECT_ID ? { data: { packageJsonModification: { scripts } } } : undefined),
      },
    },
  }) as any;

describe('PackTask', () => {
  describe('requiresCapsuleInstallation', () => {
    const packTask = new PackTask(PKG_ASPECT_ID, undefined as any, undefined as any);
    it('does not require the installation when the package.json has no pack lifecycle scripts', () => {
      expect(packTask.requiresCapsuleInstallation([componentWithScripts(), componentWithScripts({ test: 'mocha' })])).to
        .be.false;
    });
    it('requires the installation when a package.json has a pack lifecycle script', () => {
      expect(packTask.requiresCapsuleInstallation([componentWithScripts(), componentWithScripts({ prepack: 'tsc' })]))
        .to.be.true;
    });
  });
});
