import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

// see the content of this component here: https://bitsrc.io/david/tests/bar/foo
const componentTestId = 'david.tests/bar/foo';

// todo: figure out how to config CI servers to work with bit registry
describe('importing bit components from bitsrc.io', function () {
  this.timeout(0);
  const helper = new Helper();
  const barFooDir = path.join(helper.localScopePath, 'components', 'bar', 'foo');
  // before(() => {
  //   helper.runCmd('npm config set @bit:registry https://node.bitsrc.io');
  // });
  after(() => {
    helper.destroyEnv();
  });
  describe('without --save-dependencies-as-components flag', () => {
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
  });
  describe('with --save-dependencies-as-components flag', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.runCmd(`bit import ${componentTestId} --save-dependencies-as-components`);
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
});
