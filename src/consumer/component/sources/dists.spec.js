import { expect } from 'chai';
import Dists from '../../../consumer/component/sources/dists';

describe('Dists', () => {
  describe('getNodePathDir', () => {
    let consumer;
    before(() => {
      consumer = { bitConfig: {} };
      consumer.toAbsolutePath = src => src;
    });
    it('should return null when custom module resolution is not configured', () => {
      expect(Dists.getNodePathDir(consumer)).to.be.null;
    });
    it('when distTarget and distEntry are not configured it should return the default dist plus the customDir', () => {
      consumer.bitConfig.resolveModules = { modulesDirectories: ['src'] };
      expect(Dists.getNodePathDir(consumer)).to.equal('dist/src');
    });
    it('when distEntry equals to customDir it should return the distTarget', () => {
      consumer.bitConfig.distTarget = 'dist';
      consumer.bitConfig.distEntry = 'src';
      consumer.bitConfig.resolveModules = { modulesDirectories: ['src'] };
      expect(Dists.getNodePathDir(consumer)).to.equal('dist');
    });
    it('when distEntry starts with customDir it should return the distTarget + (customDir - distEntry)', () => {
      consumer.bitConfig.distTarget = 'dist';
      consumer.bitConfig.distEntry = 'src';
      consumer.bitConfig.resolveModules = { modulesDirectories: ['src/custom'] };
      expect(Dists.getNodePathDir(consumer)).to.equal('dist/custom');
    });
    it('when distEntry starts partially with customDir it should return the distTarget + (customDir - distEntry)', () => {
      consumer.bitConfig.distTarget = 'dist';
      consumer.bitConfig.distEntry = 'src';
      consumer.bitConfig.resolveModules = { modulesDirectories: ['src2'] };
      expect(Dists.getNodePathDir(consumer)).to.equal('dist/src2');
    });
    it('when there are many custom-dirs it should return them with a separator according to the OS', () => {
      consumer.bitConfig.distTarget = 'dist';
      consumer.bitConfig.distEntry = 'src';
      consumer.bitConfig.resolveModules = { modulesDirectories: ['custom1', 'custom2'] };
      const delimiter = process.platform === 'win32' ? ';' : ':';
      expect(Dists.getNodePathDir(consumer)).to.equal(`dist/custom1${delimiter}dist/custom2`);
    });
  });
});
