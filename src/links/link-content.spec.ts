import { expect } from 'chai';

import { getLinkToFileContent, getLinkToPackageContent } from './link-content';

describe('getLinkContent', () => {
  it('should generate content for simple js file', () => {
    const result = getLinkToFileContent('my-path.js');
    expect(result).to.equal("module.exports = require('./my-path');");
  });
  it('should generate correct content for npm vue package without .vue extension', () => {
    const result = getLinkToPackageContent('../../../src/pages/my-page.vue', '@bit/david.scope.components.vue-page');
    expect(result).to.have.string("module.exports = require('@bit/david.scope.components.vue-page');");
    expect(result).to.not.have.string("module.exports = require('@bit/david.scope.components.vue-page.vue');");
  });
  describe('es6 with link files', () => {
    const exportDefaultForm = 'exports.default =';
    const exportNonDefaultForm = 'exports.isString =';
    const importDefaultForm = "= _isString && _isString.hasOwnProperty('default') ? _isString.default : _isString;";
    const importNonDefaultForm = '= _isString.isString';
    describe('mainFile is not default and linkFile is default', () => {
      let linkContent;
      before(() => {
        const importSpecifier = [
          {
            mainFile: { isDefault: false, name: 'isString' },
            linkFile: { isDefault: true, name: 'isString' },
          },
        ];
        linkContent = getLinkToFileContent('is-string.js', importSpecifier);
      });
      it('the generated link should export non-default', () => {
        expect(linkContent).to.have.string(exportNonDefaultForm);
        expect(linkContent).to.not.have.string(exportDefaultForm);
      });
      it('the generated link should import default', () => {
        expect(linkContent).to.have.string(importDefaultForm);
        expect(linkContent).to.not.have.string(importNonDefaultForm);
      });
    });
    describe('mainFile and linkFile are both default', () => {
      let linkContent;
      before(() => {
        const importSpecifier = [
          {
            mainFile: { isDefault: true, name: 'isString' },
            linkFile: { isDefault: true, name: 'isString' },
          },
        ];
        linkContent = getLinkToFileContent('is-string.js', importSpecifier);
      });
      it('the generated link should export default', () => {
        expect(linkContent).to.have.string(exportDefaultForm);
        expect(linkContent).to.not.have.string(exportNonDefaultForm);
      });
      it('the generated link should import default', () => {
        expect(linkContent).to.have.string(importDefaultForm);
        expect(linkContent).to.not.have.string(importNonDefaultForm);
      });
    });
    describe('mainFile and linkFile are both non-default', () => {
      let linkContent;
      before(() => {
        const importSpecifier = [
          {
            mainFile: { isDefault: false, name: 'isString' },
            linkFile: { isDefault: false, name: 'isString' },
          },
        ];
        linkContent = getLinkToFileContent('is-string.js', importSpecifier);
      });
      it('the generated link should export non-default', () => {
        expect(linkContent).to.have.string(exportNonDefaultForm);
        expect(linkContent).to.not.have.string(exportDefaultForm);
      });
      it('the generated link should import non-default', () => {
        expect(linkContent).to.have.string(importNonDefaultForm);
        expect(linkContent).to.not.have.string(importDefaultForm);
      });
    });
    describe('mainFile is default and link file is not default', () => {
      let linkContent;
      before(() => {
        const importSpecifier = [
          {
            mainFile: { isDefault: true, name: 'isString' },
            linkFile: { isDefault: false, name: 'isString' },
          },
        ];
        linkContent = getLinkToFileContent('is-string.js', importSpecifier);
      });
      it('the generated link should export default', () => {
        expect(linkContent).to.have.string(exportDefaultForm);
        expect(linkContent).to.not.have.string(exportNonDefaultForm);
      });
      it('the generated link should import non-default', () => {
        expect(linkContent).to.have.string(importNonDefaultForm);
        expect(linkContent).to.not.have.string(importDefaultForm);
      });
    });
  });
});
