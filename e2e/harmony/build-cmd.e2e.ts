import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('build command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // the react-env calls the mdx, which uses the mdx env. so the build compiles this mdx
  // component twice. once by the aspect-env, triggered by the react-env component and
  // the second by the mdx-env.
  describe('an mdx dependency of a react env', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('mdx-component', 'my-mdx');
      helper.command.create('react-env', 'my-env');
      const importStatement = `import { MyMdx } from '@${helper.scopes.remote}/my-mdx';\n`;
      helper.fs.prependFile(path.join(helper.scopes.remote, 'my-env/my-env.docs.mdx'), importStatement);
      helper.bitJsonc.setVariant(undefined, `${helper.scopes.remote}/my-env`, { 'teambit.harmony/aspect': {} });
      helper.bitJsonc.setVariant(undefined, `${helper.scopes.remote}/my-mdx`, { 'teambit.mdx/mdx': {} });
      helper.command.link();
      helper.command.compile();
      helper.command.install('react');
      helper.command.build(`--tasks teambit.compilation/compiler`);
    });
    // previously, the Babel compiler of the react-env used to run the copy process and then
    // it was coping the my-mdx.mdx file to the dists unexpectedly.
    it('should respect the shouldCopyNonSupportedFiles of the component compiler and ignore compilers of other envs', () => {
      const capsuleDir = helper.command.getCapsuleOfComponent('my-mdx');
      const capsuleDist = path.join(capsuleDir, 'dist');
      expect(capsuleDist).to.be.a.directory();
      const filePath = path.join(capsuleDist, 'my-mdx.mdx');
      expect(filePath).to.not.be.a.path();
    });
  });
});
