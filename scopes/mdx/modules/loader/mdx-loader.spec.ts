import { expect } from 'chai';
import { bundleFixture } from './fixtures/webpack-fixture';

describe('MDX Loader', () => {
  describe('simple.mdx', () => {
    let module: any;
    // @ts-ignore conflict between mocha and jest
    beforeEach(async () => {
      module = await bundleFixture('simple.mdx');
    }, 15000);

    it('should compile the markdown and return a component', () => {
      expect(module.source).to.include('function MDXContent');
      // @ts-ignore conflict between mocha and jest
    }, 15000);

    it('should not include metadata at all', () => {
      expect(module.source).to.not.include('My Component');
      expect(module.source).to.not.include(`['first', 'component']`);
      // @ts-ignore conflict between mocha and jest
    }, 15000);
  });
});
