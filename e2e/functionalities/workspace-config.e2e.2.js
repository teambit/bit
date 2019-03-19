import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

describe('workspace config', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when the, config exists in both bit.json and package.json', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.initNpm();
      const packageJson = helper.readPackageJson();
      packageJson.bit = {
        env: {},
        componentsDefaultDirectory: 'components/{name}',
        packageManager: 'npm'
      };
      helper.writePackageJson(packageJson);
      localScope = helper.cloneLocalScope();
    });
    describe('when the config conflicts between bit.json and package.json', () => {
      before(() => {
        const bitJson = helper.readBitJson();
        bitJson.componentsDefaultDirectory = 'customBitJson/{name}';
        helper.writeBitJson(bitJson);

        const packageJson = helper.readPackageJson();
        packageJson.bit.componentsDefaultDirectory = 'customPackageJson/{name}';
        helper.writePackageJson(packageJson);
      });
      it('should use the config from bit.json and not from package.json', () => {
        helper.importComponent('bar/foo');
        expect(path.join(helper.localScopePath, 'customBitJson')).to.be.a.directory();
        expect(path.join(helper.localScopePath, 'customPackageJson')).to.not.be.a.path();
      });
    });
    describe('when Bit writes config data', () => {
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.importComponent('bar/foo -c');
      });
      it('should write the config data to both bit.json and package.json', () => {
        const bitJson = helper.readBitJson();
        expect(bitJson.env).to.have.property('compiler');
        expect(bitJson.env.compiler).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);

        const packageJson = helper.readPackageJson();
        expect(packageJson.bit.env).to.have.property('compiler');
        expect(packageJson.bit.env.compiler).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);
      });
    });
  });
  describe.only('overrides components', () => {
    describe('changing dependencies versions', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'foo.js');
        helper.createFile('', 'bar.js', "require('./foo');");
        helper.addComponent('foo.js');
        helper.addComponent('bar.js');
        helper.tagAllComponents();
        helper.tagScope('2.0.0');

        const bitJson = helper.readBitJson();
        bitJson.overrides = {
          bar: {
            dependencies: {
              foo: '0.0.1'
            }
          }
        };
        helper.writeBitJson(bitJson);
      });
      it('bit diff should show the tagged dependency version vs the version from overrides', () => {
        const diff = helper.diff('bar');
        expect(diff).to.have.string('- [ foo@2.0.0 ]');
        expect(diff).to.have.string('+ [ foo@0.0.1 ]');
      });
      describe('tagging the component', () => {
        before(() => {
          helper.tagAllComponents();
        });
        it('should save the overridden dependency version', () => {
          const bar = helper.catComponent('bar@latest');
          expect(bar.dependencies[0].id.version).to.equal('0.0.1');
          expect(bar.flattenedDependencies[0].version).to.equal('0.0.1');
        });
      });
    });
    describe.skip('removing dependencies', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('', 'foo1.js');
        helper.createFile('', 'foo2.js');
        helper.createFile('', 'bar.js', "require('./foo1'); require('./foo2'); ");
        helper.addComponent('foo1.js');
        helper.addComponent('foo2.js');
        helper.addComponent('bar.js');
        helper.tagComponent('foo1');

        // as an intermediate step, make sure that tagging 'bar' throws an error because the dependency
        // foo2 was not tagged.
        const tagBar = () => helper.tagComponent('bar');
        expect(tagBar).to.throw();

        const bitJson = helper.readBitJson();
        bitJson.overrides = {
          bar: {
            dependencies: {
              foo2: '-'
            }
          }
        };
        helper.writeBitJson(bitJson);
      });
      describe('tagging the component', () => {
        let output;
        before(() => {
          output = helper.runWithTryCatch('bit tag bar');
        });
        it('should be able to tag successfully', () => {
          expect(output).to.have.string('1 components tagged');
        });
        it('should remove the dependency and save the overrides data into the model', () => {
          const bar = helper.catComponent('bar@latest');
          expect(bar.dependencies).to.have.lengthOf(1);
          expect(bar).to.have.property('overrides');
          // @todo: assert the overrides data here.
        });
        describe('importing the component', () => {
          before(() => {
            helper.exportAllComponents();
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.importComponent('bar');
          });
          it('should write the overrides data into the package.json of the component', () => {});
        });
      });
    });
  });
});
