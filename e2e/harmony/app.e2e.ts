import chai, { expect } from 'chai';
import { join } from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const ENV_POLICY = {
  peers: [
    {
      name: 'react',
      version: '^18.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
    },
    {
      name: 'react-dom',
      version: '^18.0.0',
      supportedRange: '^17.0.0 || ^18.0.0',
    },
    {
      name: 'graphql',
      version: '14.7.0',
      supportedRange: '^14.7.0',
    },
    {
      name: '@mdx-js/react',
      version: '1.6.22',
      supportedRange: '^1.6.22',
    },
    {
      name: '@teambit/mdx.ui.mdx-scope-context',
      version: '0.0.496',
      supportedRange: '^0.0.496',
    },
  ],
};

export const REACT_CJS_APP = `module.exports.default = {
  name: 'my-app',
  entry: [require.resolve('./my-app.app-root')],
  prerender: {
    routes: ['/']
  }
};
`

describe('app command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('app run', () => {
    describe('core express app', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes({ addRemoteScopeAsDefaultScope: false });
        helper.command.create('express-app', 'my-app');
        helper.command.compile();
        helper.command.install();
        helper.bitJsonc.addKeyVal('my-scope/my-app', {});
      });
      // previously, it was supporting only app-name
      it('should support app-id', () => {
        const output = helper.general.runWithTryCatch('bit app run my-scope/my-app');
        expect(output).to.have.string('my-scope/my-app app is running on');
      });
    });
    describe('env apps API', () => {
      describe('React app', () => {
        before(() => {
          helper.scopeHelper.setNewLocalAndRemoteScopes({ addRemoteScopeAsDefaultScope: false });
          const envId = 'my-scope/react-based-env';
          // Replace with new app template of the new react env when it's ready
          helper.command.create('react-app', 'my-app');
          helper.fs.writeFile(join('my-scope', 'my-app', 'my-app.react-18-app.cjs'), REACT_CJS_APP);
          helper.fs.deletePath(join('my-scope', 'my-app','my-app.react-app.ts'))
          helper.env.setCustomNewEnv(undefined, undefined, { policy: ENV_POLICY });
          helper.command.setEnv('my-app', envId);
          helper.command.install('react-router-dom@6.4.3');
          helper.bitJsonc.addKeyVal('my-scope/my-app', {});
          helper.bitJsonc.addKeyVal('teambit.harmony/application', {envs: [envId]});
        });
        it('should show the app', () => {
          const output = helper.command.listApps();
          expect(output).to.have.string('my-app');
          expect(output).to.have.string('my-scope/my-app');
        });
        it('should run the app', () => {
          const output = helper.general.runWithTryCatch('bit app run my-app');
          expect(output).to.have.string('my-app app is running on');
        });
      });
    });
  });
});
