import { expect } from 'chai';

import BitId from './bit-id';
import { InvalidName, InvalidScopeName } from './exceptions';

describe('Bit-id', () => {
  // TODO: those tests are now verified by TS compiler, I think we can remove them
  it('should be frozen', () => {
    const bitId = new BitId({ name: 'my-name' });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    expect(() => (bitId.scope = 'name')).to.throw();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    expect(() => (bitId.name = 'name')).to.throw();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    expect(() => (bitId.version = 'name')).to.throw();
  });
  describe('constructor', () => {
    it('should not throw for an invalid scope as it hurts performance (it is done on .parse() instead)', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const invalidScope = () => new BitId({ scope: 123, name: 'my-name' });
      expect(invalidScope).to.not.throw(InvalidScopeName);
    });
    it('should not throw for an invalid name as it hurts performance (it is done on .parse() instead)', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const invalidName = () => new BitId({ name: ['a', 'b'] });
      expect(invalidName).to.not.throw(InvalidName);
    });
    it('should accept an empty scope', () => {
      const invalidScope = () => new BitId({ scope: null, name: 'my-name' });
      expect(invalidScope).to.not.throw();
    });
    it('should not accept an empty name', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(() => new BitId({ scope: 'my-scope', name: null })).to.throw(InvalidName);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(() => new BitId({ scope: 'my-scope', name: undefined })).to.throw(InvalidName);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(() => new BitId({ scope: 'my-scope' })).to.throw(InvalidName);
    });
  });
  describe('changeScope', () => {
    it('should return a new BitId with different scope', () => {
      const bitId = new BitId({ name: 'my-name' });
      expect(bitId.changeScope('my-scope')).to.have.property('scope').that.equal('my-scope');
    });
    it('should accept an empty parameter to remove the scope', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name' });
      expect(bitId.changeScope()).to.have.property('scope').that.is.null;
    });
  });
  describe('changeVersion', () => {
    it('should return a new BitId with different version', () => {
      const bitId = new BitId({ name: 'my-name' });
      expect(bitId.changeVersion('0.0.1')).to.have.property('version').that.equal('0.0.1');
    });
    it('should accept an empty parameter to remove the version', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(bitId.changeVersion()).to.have.property('version').that.is.undefined;
    });
  });
  describe('hasScope', () => {
    it('should return false when there is no scope', () => {
      const bitId = new BitId({ name: 'my-name' });
      expect(bitId.hasScope()).to.be.false;
    });
    it('should return true when there is scope', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name' });
      expect(bitId.hasScope()).to.be.true;
    });
  });
  describe('getValidBitId', () => {
    it('should convert CSSComp to css-comp', () => {
      const bitName = 'CSSComp';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/css-comp');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    });
    it('should convert EN-US to en-us', () => {
      const bitName = 'EN-US';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/en-us');
    });
    it('should convert AppBar to app-bar', () => {
      const bitName = 'AppBar';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/app-bar');
    });
    it('should convert app-bar to app-bar', () => {
      const bitName = 'app-bar';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/app-bar');
    });
    it('should convert app-Bar to app-bar', () => {
      const bitName = 'app-Bar';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/app-bar');
    });
    it('should convert App-Bar to app-bar', () => {
      const bitName = 'App-Bar';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/app-bar');
    });
    it('should convert CSScomp to cs-scomp ', () => {
      const bitName = 'CSScomp';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/cs-scomp');
    });
    it('should convert CSS@comp/CSScomp to css@comp/cs-scomp ', () => {
      const bitName = 'CSScomp';
      const global = 'CSS@comp';
      expect(BitId.getValidBitId(global, bitName).toString()).to.equal('css@comp/cs-scomp');
    });
    it('should convert CSS!!####@comp/app-Bar to app-Bar', () => {
      const bitName = 'app-Bar';
      const global = 'CSS!!####@comp';
      expect(BitId.getValidBitId(global, bitName).toString()).to.equal('css!!####@comp/app-bar');
    });
    it('should convert app bar to app-bar', () => {
      const bitName = 'app bar';
      expect(BitId.getValidBitId(undefined, bitName).toString()).to.equal('app-bar');
    });
  });
  describe('toString', () => {
    it('should not contain the version as latest', () => {
      const bitId = BitId.parse('bit.envs/mocha/react@latest');
      expect(bitId.toString()).to.equal('bit.envs/mocha/react');
    });
  });
  describe('parse', () => {
    it('should parse id with scope correctly', () => {
      const bitId = BitId.parse('scope/my/long/comp/id', true);
      expect(bitId.scope).to.equal('scope');
      expect(bitId.name).to.equal('my/long/comp/id');
      expect(bitId.box).to.be.undefined;
      expect(bitId.version).to.equal('latest');
    });
    it('should parse id without scope correctly', () => {
      const bitId = BitId.parse('scope/my/long/comp/id', false);
      expect(bitId.scope).to.be.null;
      expect(bitId.name).to.equal('scope/my/long/comp/id');
      expect(bitId.box).to.be.undefined;
      expect(bitId.version).to.equal('latest');
    });
    it('should throw for an invalid id', () => {
      const bitId = () => BitId.parse('scope/my/long/co*mp/id', false);
      expect(bitId).to.throw();
    });
  });
  describe('hasSameScope', () => {
    it('should return true when it has the same scope', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name' });
      const anotherId = new BitId({ scope: 'my-scope', name: 'another-name' });
      expect(bitId.hasSameScope(anotherId)).to.be.true;
    });
    it('should return false when it does not the same scope', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name' });
      const anotherId = new BitId({ scope: 'another-scope', name: 'my-name' });
      expect(bitId.hasSameScope(anotherId)).to.be.false;
    });
    it('should return true when both scopes are null', () => {
      const bitId = new BitId({ scope: null, name: 'my-name' });
      const anotherId = new BitId({ scope: null, name: 'my-name' });
      expect(bitId.hasSameScope(anotherId)).to.be.true;
    });
    it('should return false when one of the scope is null', () => {
      const bitId = new BitId({ scope: null, name: 'my-name' });
      const anotherId = new BitId({ scope: 'another-scope', name: 'my-name' });
      expect(bitId.hasSameScope(anotherId)).to.be.false;
    });
  });
  describe('isEqual', () => {
    it('should return true for an exact match', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      const anotherId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      expect(bitId.isEqual(anotherId)).to.be.true;
    });
    it('should return false for a version mismatch', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      const anotherId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.2' });
      expect(bitId.isEqual(anotherId)).to.be.false;
    });
    it('should return false for a name mismatch', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      const anotherId = new BitId({ scope: 'my-scope', name: 'another-name', version: '0.0.1' });
      expect(bitId.isEqual(anotherId)).to.be.false;
    });
    it('should return false for a scope mismatch', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      const anotherId = new BitId({ scope: 'another-scope', name: 'my-name', version: '0.0.1' });
      expect(bitId.isEqual(anotherId)).to.be.false;
    });
  });
  describe('serialize', () => {
    it('should delete the scope property if not set', () => {
      const bitId = new BitId({ name: 'my-name', version: '0.0.1' });
      expect(bitId.serialize()).to.not.have.property('scope');
    });
    it('should delete the version property if not set', () => {
      const bitId = new BitId({ name: 'my-name' });
      expect(bitId.serialize()).to.not.have.property('version');
    });
    it('should include all properties if they are all set', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      expect(bitId.serialize()).to.have.property('name');
      expect(bitId.serialize()).to.have.property('scope');
      expect(bitId.serialize()).to.have.property('version');
    });
    it('should not be an instance of BitId', () => {
      const bitId = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' });
      expect(bitId.serialize()).to.not.be.an.instanceof(BitId);
    });
  });
  describe('parseBackwardCompatible', () => {
    it('should parse the new format, which is an object', () => {
      const bitIdObj = new BitId({ scope: 'my-scope', name: 'my-name', version: '0.0.1' }).serialize();
      const bitId = BitId.parseBackwardCompatible(bitIdObj);
      expect(bitId).to.be.an.instanceof(BitId);
      expect(bitId.name).to.equal('my-name');
      expect(bitId.scope).to.equal('my-scope');
      expect(bitId.version).to.equal('0.0.1');
    });
    it('should parse the old format, which is a string', () => {
      const bitIdStr = 'my-scope/my-box/my-name@0.0.1';
      const bitId = BitId.parseBackwardCompatible(bitIdStr);
      expect(bitId).to.be.an.instanceof(BitId);
      expect(bitId.name).to.equal('my-box/my-name');
      expect(bitId.scope).to.equal('my-scope');
      expect(bitId.version).to.equal('0.0.1');
    });
  });
});
