import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { BitId } from '@teambit/legacy-bit-id';
import { logger } from '@teambit/legacy.logger';
import { BitMap } from './bit-map';
import { WORKSPACE_ROOT_DIR } from './component-map';
import { DuplicateRootDir } from './exceptions/duplicate-root-dir';

const getBitmapInstance = async () => {
  return BitMap.load(__dirname, '');
};

const addComponentParamsFixture = {
  componentId: ComponentID.fromObject({ name: 'is-string' }, 'my-scope'),
  files: [{ name: 'is-string.js', relativePath: 'is-string.js', test: false }],
  mainFile: 'is-string.js',
  defaultScope: 'my-scope',
};

describe('BitMap', function () {
  // @ts-ignore
  logger.debug = () => {};
  // @ts-ignore
  logger.info = () => {};
  // @ts-ignore
  // this.timeout(0);
  describe('toObject', () => {
    let bitMap: BitMap;
    let componentMap;
    before(async () => {
      bitMap = await getBitmapInstance();
      bitMap.addComponent(addComponentParamsFixture);
      const allComponents = bitMap.toObjects();
      componentMap = allComponents['is-string'];
    });
    it('should remove the "id" property', () => {
      expect(componentMap).to.not.have.property('id');
    });
    it('should sort the components alphabetically', async () => {
      const exampleComponent = { ...addComponentParamsFixture };
      exampleComponent.defaultScope = '';
      bitMap = await getBitmapInstance();
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string1', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string3', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      exampleComponent.componentId = new ComponentID(
        new BitId({ scope: 'my-scope', name: 'is-string2', version: '0.0.1' })
      );
      bitMap.addComponent(exampleComponent);
      const allComponents = bitMap.toObjects();
      const ids = Object.keys(allComponents);
      expect(ids[0]).to.equal('is-string1');
      expect(ids[1]).to.equal('is-string2');
      expect(ids[2]).to.equal('is-string3');
    });
  });
  describe('loadComponents', () => {
    let bitMap: BitMap;
    before(async () => {
      bitMap = await getBitmapInstance();
    });
    it('should throw DuplicateRootDir error when multiple ids have the same rootDir', () => {
      const invalidBitMap = {
        comp1: {
          mainFile: 'index.js',
          rootDir: 'comp1',
        },
        comp2: {
          mainFile: 'index.js',
          rootDir: 'comp1',
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap, 'my-scope')).to.throw(DuplicateRootDir);
    });
    it('should throw when a component has scope but not version', () => {
      const invalidBitMap = {
        'scope/comp1': {
          mainFile: 'index.js',
          scope: 'scope',
          rootDir: 'comp1',
          exported: true,
        },
      };
      expect(() => bitMap.loadComponents(invalidBitMap, 'my-scope')).to.throw(
        '.bitmap entry of "scope/comp1" is invalid, it has a scope-name "scope", however, it does not have any version'
      );
    });
  });
  describe('workspace-root component', () => {
    const rootComponentParams = {
      componentId: ComponentID.fromObject({ name: 'ws-root' }, 'my-scope'),
      files: [{ name: 'README.md', relativePath: 'README.md', test: false }],
      mainFile: 'README.md',
      defaultScope: 'my-scope',
      rootDir: WORKSPACE_ROOT_DIR,
    };
    const nestedComponentParams = {
      componentId: ComponentID.fromObject({ name: 'comp1' }, 'my-scope'),
      files: [{ name: 'index.js', relativePath: 'index.js', test: false }],
      mainFile: 'index.js',
      defaultScope: 'my-scope',
      rootDir: 'packages/comp1',
    };
    it('should allow a rootDir of "." to contain other components, in both add orders', async () => {
      const rootFirst = await getBitmapInstance();
      rootFirst.addComponent(rootComponentParams);
      expect(() => rootFirst.addComponent(nestedComponentParams)).to.not.throw();

      const nestedFirst = await getBitmapInstance();
      nestedFirst.addComponent(nestedComponentParams);
      expect(() => nestedFirst.addComponent(rootComponentParams)).to.not.throw();
    });
    it('should keep rejecting nesting between two non-root components', async () => {
      const bitMap = await getBitmapInstance();
      bitMap.addComponent(nestedComponentParams);
      expect(() =>
        bitMap.addComponent({
          ...nestedComponentParams,
          componentId: ComponentID.fromObject({ name: 'comp2' }, 'my-scope'),
          rootDir: 'packages/comp1/nested',
        })
      ).to.throw();
    });
    it('getNestedRootDirs should return the nested components for the root, and nothing for a leaf', async () => {
      const bitMap = await getBitmapInstance();
      bitMap.addComponent(rootComponentParams);
      bitMap.addComponent(nestedComponentParams);
      expect(bitMap.getNestedRootDirs(WORKSPACE_ROOT_DIR)).to.deep.equal(['packages/comp1']);
      expect(bitMap.getNestedRootDirs('packages/comp1')).to.deep.equal([]);
    });
  });
});
