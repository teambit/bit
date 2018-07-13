import { expect } from 'chai';
import { BitId } from '../../src/bit-id';

describe('Bit-id', () => {
  describe('getValidBitId', () => {
    it('should convert CSSComp to css-comp', () => {
      const bitName = 'CSSComp';
      expect(BitId.getValidBitId('global', bitName).toString()).to.equal('global/css-comp');
    }).timeout(5000);
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
      expect(bitId.box).to.be.null;
      expect(bitId.version).to.equal('latest');
    });
    it('should parse id without scope correctly', () => {
      const bitId = BitId.parse('scope/my/long/comp/id', false);
      expect(bitId.scope).to.be.null;
      expect(bitId.name).to.equal('scope/my/long/comp/id');
      expect(bitId.box).to.be.null;
      expect(bitId.version).to.equal('latest');
    });
    it('should throw for an invalid id', () => {
      const bitId = () => BitId.parse('scope/my/long/co*mp/id', false);
      expect(bitId).to.throw();
    });
  });
});
