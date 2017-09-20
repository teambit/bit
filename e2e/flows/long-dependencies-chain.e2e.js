import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const sizeOfChain = 5;

describe('flow of a long-dependencies-chain', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('a component bar4/foo4 (or any other number set in sizeOfChain) has a dependency bar3/foo3, which has a dependency bar2/foo2 and so on', () => {
    if (process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
      before(() => {
        helper.reInitRemoteScope();
        for (let i = 0; i < sizeOfChain; i += 1) {
          const file = `foo${i}`;
          const dir = `bar${i}`;

          helper.reInitLocalScope();
          helper.addRemoteScope();

          let impl;
          if (i > 0) {
            // require the previous component
            const previousFile = `foo${i - 1}`;
            const previousDir = `bar${i - 1}`;
            helper.importComponent(`${previousDir}/${previousFile}`);
            impl = `const foo = require('bit/${previousDir}/${previousFile}/${previousDir}/${previousFile}'); 
          module.exports = function ${file}() { return foo() + ' and got ${file}'; };
          `;
          } else {
            impl = `module.exports = function ${file}() { return 'got ${file}'; };`;
          }

          helper.createFile(dir, `${file}.js`, impl);
          helper.addComponent(path.join(dir, `${file}.js`));
          helper.commitComponent(`${dir}/${file}`);
          helper.exportComponent(`${dir}/${file}`);
        }
      });
      it('should display results from its direct dependency and the long chain of indirect dependencies', () => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        const lastComponent = `bar${sizeOfChain - 1}/foo${sizeOfChain - 1}`;
        helper.importComponent(lastComponent);
        const appJsFixture = `const barFoo = require('./components/${lastComponent}'); console.log(barFoo());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        const arrayOfSizeOfChain = [...Array(sizeOfChain).keys()];
        const expectedResult = arrayOfSizeOfChain.map(num => `got foo${num}`).join(' and ');
        expect(result.trim()).to.equal(expectedResult);
      });
    }
  });
});

/**
 * The following files (find . -type f -print) are generated when the sizeOfChain is 5.
 ./app.js
 ./bit.json
 ./components/bar4/foo4/bar4/foo4.js
 ./components/bar4/foo4/bit.json
 ./components/bar4/foo4/components/bar3/foo3/bar3/foo3.js

 ./components/bar4/foo4/dependencies/bar0/foo0/remote-scope/1/bar0/foo0.js
 ./components/bar4/foo4/dependencies/bar0/foo0/remote-scope/1/bit.json
 ./components/bar4/foo4/dependencies/bar0/foo0/remote-scope/1/index.js

 ./components/bar4/foo4/dependencies/bar1/foo1/remote-scope/1/bar1/foo1.js
 ./components/bar4/foo4/dependencies/bar1/foo1/remote-scope/1/bit.json
 ./components/bar4/foo4/dependencies/bar1/foo1/remote-scope/1/components/bar0/foo0/bar0/foo0.js
 ./components/bar4/foo4/dependencies/bar1/foo1/remote-scope/1/index.js

 ./components/bar4/foo4/dependencies/bar2/foo2/remote-scope/1/bar2/foo2.js
 ./components/bar4/foo4/dependencies/bar2/foo2/remote-scope/1/bit.json
 ./components/bar4/foo4/dependencies/bar2/foo2/remote-scope/1/components/bar1/foo1/bar1/foo1.js
 ./components/bar4/foo4/dependencies/bar2/foo2/remote-scope/1/index.js

 ./components/bar4/foo4/dependencies/bar3/foo3/remote-scope/1/bar3/foo3.js
 ./components/bar4/foo4/dependencies/bar3/foo3/remote-scope/1/bit.json
 ./components/bar4/foo4/dependencies/bar3/foo3/remote-scope/1/components/bar2/foo2/bar2/foo2.js
 ./components/bar4/foo4/dependencies/bar3/foo3/remote-scope/1/index.js

 ./components/bar4/foo4/index.js
 */
