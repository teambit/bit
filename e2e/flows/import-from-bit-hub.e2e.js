import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

// see the content of this component here: https://bitsrc.io/david/tests/bar/foo
const componentTestId = 'david.tests/bar/foo';
const componentES6TestId = 'david.tests-es6/bar/foo-es6';

describe('importing bit components from bitsrc.io', function () {
  this.timeout(0);
  const helper = new Helper();
  const barFooDir = path.join(helper.localScopePath, 'components', 'bar', 'foo');
  after(() => {
    helper.destroyEnv();
  });
  describe('when saveDependenciesAsComponents is the default (FALSE) in consumer bit.json', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.runCmd(`bit import ${componentTestId}`);
    });
    it('should not save the dependencies as bit components inside the component directory', () => {
      expect(path.join(helper.localScopePath, 'components', '.dependencies')).to.not.be.a.path();
    });
    it('should not write the dependencies in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('david.tests/bar/foo@0.0.1');
      expect(bitMap).to.not.have.property('david.tests/utils/is-string@0.0.1');
      expect(bitMap).to.not.have.property('david.tests/utils/is-type@0.0.1');
    });
    it('should install the dependencies as npm packages', () => {
      expect(
        path.join(barFooDir, 'node_modules', '@bit', 'david.tests.utils.is-string', 'is-string.js')
      ).to.be.a.path();
      expect(path.join(barFooDir, 'node_modules', '@bit', 'david.tests.utils.is-type', 'is-type.js')).to.be.a.path();
    });
    it('should generate all the links correctly and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    it('should recognize the npm packages as dependencies when loading from the file system', () => {
      const showOutput = helper.showComponentParsed();
      expect(showOutput.dependencies[0].id).to.equal('david.tests/utils/is-string@0.0.1');
    });
    it("bit status should not show the component (because it's not new/modified/staged etc)", () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('bar/foo')).to.be.false;
    });
  });
  describe('when saveDependenciesAsComponents is set to TRUE in consumer bit.json', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.modifyFieldInBitJson('saveDependenciesAsComponents', true);
      helper.runCmd(`bit import ${componentTestId}`);
    });
    it('should save the dependencies as bit components inside the component directory', () => {
      expect(path.join(helper.localScopePath, 'components', '.dependencies')).to.be.a.path();
    });
    it('should write the dependencies in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('david.tests/bar/foo@0.0.1');
      expect(bitMap).to.have.property('david.tests/utils/is-string@0.0.1');
      expect(bitMap).to.have.property('david.tests/utils/is-type@0.0.1');
    });
    it('should not install the dependencies as npm packages', () => {
      expect(
        path.join(barFooDir, 'node_modules', '@bit', 'david.tests.utils.is-string', 'is-string.js')
      ).to.not.be.a.path();
      expect(
        path.join(barFooDir, 'node_modules', '@bit', 'david.tests.utils.is-type', 'is-type.js')
      ).to.not.be.a.path();
    });
    it('should generate all the links correctly and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('ES6 component', () => {
    describe('with --dist flag', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.runCmd(`bit import ${componentES6TestId} --dist`);
      });
      it('should generate all the links in the dists dir correctly and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo-es6'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    describe('without --dist flag and running bit build afterwards', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.runCmd(`bit import ${componentES6TestId}`);
        helper.build('bar/foo-es6');
      });
      it('should generate all the links in the dists dir correctly and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo-es6'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
});
