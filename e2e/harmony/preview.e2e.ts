import chai, { expect } from 'chai';

import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('preview feature (during build)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('jsx component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope({ disablePreview: false });
      helper.fs.outputFile(
        'button/button.jsx',
        `import React from 'react'

      export const Button = ({children}) => {
          return (
              <button>{children}</button>
          )
      }`
      );
      helper.fs.outputFile(
        'button/button.composition.jsx',
        `import React from 'react'
      import { Button } from "./button";

      export const PrimaryButton = () => {
          return <Button>Click me!</Button>
      }`
      );
      helper.fs.outputFile('index.js', `export { Button } from './button';`);
      helper.command.addComponent('button');
      helper.command.install('--add-missing-deps');
      helper.command.compile();
    });
    it('bit build should run successfully without preview errors', () => {
      // before, it used to throw "Support for the experimental syntax 'jsx' isn't currently enabled"
      const buildOutput = helper.command.build();
      expect(buildOutput).to.have.string('build succeeded');
    });
  });
});
