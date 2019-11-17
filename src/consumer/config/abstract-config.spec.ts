import { expect } from 'chai';
import AbstractConfig from './abstract-config';
import { EXTENSION_BIT_CONFIG_PREFIX } from '../../constants';

const rawExtension1 = {
  myKey: 'myVal',
  _bit_pathToLoadFrom: '/myExtensionPath',
  _bit_disabled: false
};

const rawExtension2 = {
  myKey2: 'myVal2',
  _bit_pathToLoadFrom: '/myExtensionPath2',
  _bit_disabled: false
};

describe('extensions transformation', () => {
  describe('from extension to raw extension', () => {
    let rawExtension;
    before(() => {
      const extension = {
        rawConfig: {
          myKey: 'myVal'
        },
        options: {
          pathToLoadFrom: '/myExtensionPath',
          disabled: false
        }
      };
      rawExtension = AbstractConfig.transformExtensionToRawExtension(extension);
    });
    it('should have bit options with correct prefix', () => {
      expect(rawExtension).to.have.property(`${EXTENSION_BIT_CONFIG_PREFIX}pathToLoadFrom`, '/myExtensionPath');
      expect(rawExtension).to.have.property(`${EXTENSION_BIT_CONFIG_PREFIX}disabled`, false);
    });
    it('should have the raw config', () => {
      expect(rawExtension).to.have.property('myKey', 'myVal');
    });
    it('should not have the extension keys (rawConfig / options)', () => {
      expect(rawExtension).to.not.have.property('rawConfig');
      expect(rawExtension).to.not.have.property('options');
    });
  });
  describe('from raw extension to extension', () => {
    let extension;
    before(() => {
      extension = AbstractConfig.transformRawExtensionToExtension(rawExtension1);
    });
    it('should have bit options with correct values', () => {
      expect(extension).to.have.property('options');
      expect(extension.options).to.have.property('pathToLoadFrom', '/myExtensionPath');
      expect(extension.options).to.have.property('disabled', false);
    });
    it('should have the raw config', () => {
      expect(extension).to.have.property('rawConfig');
      expect(extension.rawConfig).to.have.property('myKey', 'myVal');
    });
    it('should not have the original raw extension keys', () => {
      expect(extension).to.not.have.property('myKey');
      expect(extension).to.not.have.property('_bit_pathToLoadFrom');
      expect(extension).to.not.have.property('_bit_disabled');
    });
  });
  describe('transform all raw extensions to extensions', () => {
    let rawExtensions = {
      ext1: rawExtension1,
      ext2: rawExtension2
    };
    let extensions;
    before(() => {
      extensions = AbstractConfig.transformAllRawExtensionsToExtensions(rawExtensions);
    });
    it('should have all extensions entries', () => {
      expect(extensions).to.have.property('ext1');
      expect(extensions).to.have.property('ext2');
    });
    it('should have bit options with correct values', () => {
      expect(extensions.ext1).to.have.property('options');
      expect(extensions.ext1.options).to.have.property('pathToLoadFrom', '/myExtensionPath');
      expect(extensions.ext1.options).to.have.property('disabled', false);
      expect(extensions.ext2).to.have.property('options');
      expect(extensions.ext2.options).to.have.property('pathToLoadFrom', '/myExtensionPath2');
      expect(extensions.ext2.options).to.have.property('disabled', false);
    });
    it('should have the raw config', () => {
      expect(extensions.ext1).to.have.property('rawConfig');
      expect(extensions.ext1.rawConfig).to.have.property('myKey', 'myVal');
      expect(extensions.ext2).to.have.property('rawConfig');
      expect(extensions.ext2.rawConfig).to.have.property('myKey2', 'myVal2');
    });
    it('should not have the original raw extension keys', () => {
      expect(extensions.ext1).to.not.have.property('myKey');
      expect(extensions.ext1).to.not.have.property('_bit_pathToLoadFrom');
      expect(extensions.ext1).to.not.have.property('_bit_disabled');
      expect(extensions.ext2).to.not.have.property('myKey');
      expect(extensions.ext2).to.not.have.property('_bit_pathToLoadFrom');
      expect(extensions.ext2).to.not.have.property('_bit_disabled');
    });
  });
  describe('transform all extensions to raw extensions', () => {
    let rawExtensions = {
      ext1: rawExtension1,
      ext2: rawExtension2
    };
    let rawExtensionsCalculated;
    before(() => {
      let extensions;
      extensions = AbstractConfig.transformAllRawExtensionsToExtensions(rawExtensions);
      rawExtensionsCalculated = AbstractConfig.transformAllExtensionsToRawExtensions(extensions);
    });
    it('should transform correct', () => {
      expect(rawExtensionsCalculated).to.deep.equal(rawExtensions);
    });
  });
});
