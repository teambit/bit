import { expect } from 'chai';
import AbstractConfig from './abstract-config';
import { EXTENSION_BIT_CONFIG_PREFIX } from '../../constants';

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
      const rawExtension = {
        myKey: 'myVal',
        _bit_pathToLoadFrom: '/myExtensionPath',
        _bit_disabled: false
      };
      extension = AbstractConfig.transformRawExtensionToExtension(rawExtension);
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
});
