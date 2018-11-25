import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit extension system', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('simple, object extension (hello world extension) registered to preStatusHook', () => {
    let statusOutput;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile(
        '.',
        'object-ext.js',
        `module.exports = {
        preStatusHook: () => console.log('Hello World')
      };`
      );
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      const bitJson = helper.readBitJson();
      bitJson.extensions = { 'file://./object-ext.js': {} };
      helper.writeBitJson(bitJson);
      statusOutput = helper.status();
    });
    it('should react to the registered hook (by printing Hello World)', () => {
      expect(statusOutput).to.have.string('Hello World');
    });
    it('should not allow tagging a file extension', () => {
      const tagOutput = helper.runWithTryCatch('bit tag bar/foo');
      expect(tagOutput).to.have.string(
        'to be able to import the component later, please add the extension as a component'
      );
      expect(tagOutput).to.not.have.string('1 components tagged');
    });
    it('should allow tagging a file extension when --dev-mode flag is specified', () => {
      const tagOutput = helper.tagAllWithoutMessage('--dev-mode');
      expect(tagOutput).to.have.string('1 components tagged');
    });
  });
  describe('pseudo-class extension with various props types', () => {
    let statusOutput;
    let extensionId;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.copyFixtureFile('extensions/es5-ext.js');
      helper.copyFixtureFile('extensions/ext-file.js');
      helper.addComponent('es5-ext.js', { i: 'ext/es5' });
      helper.tagAllWithoutMessage();
      helper.exportAllComponents();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      const bitJson = helper.readBitJson();
      extensionId = `${helper.remoteScope}/ext/es5@0.0.1`;
      bitJson.extensions = {
        [extensionId]: {
          myStringKey: 'my overridden string'
        }
      };
      helper.writeBitJson(bitJson);
      statusOutput = helper.status();
    });
    it('should react to the registered hook (by printing Hello World)', () => {
      expect(statusOutput).to.have.string('Hello World');
    });
    describe('tagging the component', () => {
      let barFoo;
      before(() => {
        helper.commitComponentBarFoo();
        barFoo = helper.catComponent('bar/foo@latest');
      });
      it('should not throw an error on bit status', () => {
        const output = helper.status();
        expect(output).to.have.string('bar/foo');
      });
      it('should save a new property "extension" into the scope', () => {
        expect(barFoo).to.have.property('extensions');
      });
      it('"extension" property should be an array with the same amount of extensions declared in bit.json', () => {
        expect(barFoo.extensions)
          .to.be.an('array')
          .with.lengthOf(1);
      });
      it('extension item should have id with the extension name and data as a hash', () => {
        const extension = barFoo.extensions[0];
        expect(extension.id).to.equal(extensionId);
        expect(extension.data).to.be.a('string');
      });
      describe('extension-data-model', () => {
        let extensionData;
        before(() => {
          const extensionDataHash = barFoo.extensions[0].data;
          extensionData = helper.catObject(extensionDataHash, true);
        });
        it('should be an array of objects with the properties: "name", "value" and "type"', () => {
          expect(extensionData).to.be.an('array');
          extensionData.forEach((extension) => {
            expect(extension).to.have.property('name');
            expect(extension).to.have.property('value');
            expect(extension).to.have.property('type');
          });
        });
        it('should save "Any" type correctly', () => {
          const field = extensionData.find(e => e.name === 'myAnyKey');
          expect(field.value).to.deep.equal({ strKey: 'hello', numKey: 1234 });
          expect(field.type).to.equal('any');
        });
        it('should save "Boolean" type correctly', () => {
          const field = extensionData.find(e => e.name === 'myBooleanKey');
          expect(field.value).to.be.false;
          expect(field.type).to.equal('boolean');
        });
        it('should save "String" type correctly with its overridden value', () => {
          const field = extensionData.find(e => e.name === 'myStringKey');
          expect(field.value).to.equal('my overridden string');
          expect(field.type).to.equal('string');
        });
        it('should save "Number" type correctly', () => {
          const field = extensionData.find(e => e.name === 'myNumberKey');
          expect(field.value).to.equal(123);
          expect(field.type).to.equal('number');
        });
        it('should save "Array" type correctly', () => {
          const field = extensionData.find(e => e.name === 'myArrayKey');
          expect(field.value).to.deep.equal(['a', 'b']);
          expect(field.type).to.equal('array<string>');
        });
        it('should save "file" type correctly and the file content', () => {
          const field = extensionData.find(e => e.name === 'myFileKey');
          expect(field.type).to.equal('file');
          expect(field.value).to.be.an('object');
          expect(field.value.relativePath).to.equal('ext-file.js');

          const fileHash = field.value.file;
          const fileContent = helper.catObject(fileHash);
          expect(fileContent).to.have.string(helper.readFile('ext-file.js'));
        });
        it('should not save fields with unset values', () => {
          const field = extensionData.find(e => e.name === 'myEmptyKey');
          expect(field).to.be.undefined;
        });
      });
    });
  });
  it.skip('Exception from hook should not affect others which are registers for that hook', () => {});
  describe('new command by extension', () => {
    it.skip('Should be shown in --help', () => {});
    it.skip('Should be able to run "bit <command> -h"', () => {});
    it.skip('should be able to run the command', () => {});
  });
  it.skip('2 different extensions create hook with the same name', () => {});
  describe('extension logger', () => {
    it.skip('Should write to log', () => {});
    it.skip('Should check that the name of the extension appears in the log', () => {});
  });

  describe('when importing extension', () => {
    it.skip('Should be able to import extension with --extension flag', () => {});
    it.skip('extension should be able to use a dependency', () => {});
    describe('when importing another version of the same extension', () => {
      it.skip('Should have the latest import in the bit.json', () => {});
      it.skip('Should copy the config / options in bit.json to the new version', () => {});
    });
  });
  describe('loading extension', () => {
    it.skip('Should be able to load from a local file using relative path', () => {});
    it.skip('Should be able to load from a local file using absolute path', () => {});
    it.skip('Should be able to load from an installed extension', () => {});
    it.skip('Should load extension from workspace if it was imported as regular component in the same version', () => {});
    it.skip('Should pass the config to extensions init function', () => {});
    it.skip('Core extensions should load', () => {});
    it.skip('Extension with exception during init should not corrupt bit', () => {});
    it.skip('Should not load a disabled extension', () => {});
  });
  describe('load extension programmatically', () => {
    it.skip('extension can be loaded programmatically', () => {});
  });
  describe('isolated component', () => {
    it.skip('api of an isolated component should work in an extension', () => {});
  });
  describe('Hooks', () => {
    describe('extension can register a new hook', () => {
      it.skip('Should be able to trigger the hook they created', () => {});
      it.skip("Should not be able to trigger a hook they didn't create", () => {});
    });
    describe('default hooks', () => {
      it.skip('default hook should run when triggered', () => {});
    });
  });
});
