import { expect } from 'chai';
import { getPublishRegistry, shouldPublishToExternalRegistry } from './publish-config';

describe('publish-config', () => {
  describe('shouldPublishToExternalRegistry', () => {
    it('should not publish without a pkg config', () => {
      expect(shouldPublishToExternalRegistry(undefined)).to.equal(false);
      expect(shouldPublishToExternalRegistry({})).to.equal(false);
    });
    it('should publish when the package has a name or a publishConfig', () => {
      expect(shouldPublishToExternalRegistry({ packageJson: { name: '@org/pkg' } })).to.equal(true);
      expect(shouldPublishToExternalRegistry({ packageJson: { publishConfig: {} } })).to.equal(true);
    });
    it('should honor the avoidPublishToNPM opt-out', () => {
      expect(shouldPublishToExternalRegistry({ packageJson: { name: '@org/pkg' }, avoidPublishToNPM: true })).to.equal(
        false
      );
    });
  });

  describe('getPublishRegistry', () => {
    it('should return undefined when no registry is configured', () => {
      expect(getPublishRegistry(undefined)).to.equal(undefined);
      expect(getPublishRegistry({ packageManagerPublishArgs: ['--access public'] })).to.equal(undefined);
    });
    it('should read the registry from publishConfig', () => {
      expect(getPublishRegistry({ packageJson: { publishConfig: { registry: 'https://a.example.com/' } } })).to.equal(
        'https://a.example.com/'
      );
    });
    it('should read a --registry argument given with a space or with "="', () => {
      expect(getPublishRegistry({ packageManagerPublishArgs: ['--registry https://a.example.com/'] })).to.equal(
        'https://a.example.com/'
      );
      expect(getPublishRegistry({ packageManagerPublishArgs: ['--registry=https://a.example.com/'] })).to.equal(
        'https://a.example.com/'
      );
    });
    it('should prefer the --registry argument over publishConfig', () => {
      const registry = getPublishRegistry({
        packageManagerPublishArgs: ['--access', 'public', '--registry', 'https://a.example.com/'],
        packageJson: { publishConfig: { registry: 'https://b.example.com/' } },
      });
      expect(registry).to.equal('https://a.example.com/');
    });
  });
});
