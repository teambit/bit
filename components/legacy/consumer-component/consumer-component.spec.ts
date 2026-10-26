import { expect } from 'chai';
import { Component } from './consumer-component';
import { SourceFile } from '@teambit/component.sources';
import { ComponentID, ComponentIdList } from '@teambit/component-id';

describe('ConsumerComponent', function () {
  // @ts-ignore
  this.timeout(0);
  describe('docs', () => {
    const componentProps = {
      name: 'is-string',
      defaultScope: 'my-scope',
      mainFile: 'is-string.js',
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      files: [new SourceFile({ base: '.', path: 'is-string.js', contents: Buffer.from(''), test: false })],
    };
    it('should return an empty array when there is no docs', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component(componentProps);
      expect(component.docs).to.deep.equal([]);
    });
    it('should generate bindingPrefix based on the defaultScope if not specified', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component(componentProps);
      expect(component.bindingPrefix).to.equal('@my-scope');
    });
  });
  describe('flattenedDependencies', () => {
    const componentProps = {
      name: 'is-string',
      defaultScope: 'my-scope',
      mainFile: 'is-string.js',
      files: [],
    };
    it('should load them only when read, and only once', () => {
      let loaded = 0;
      const load = () => {
        loaded += 1;
        return new ComponentIdList(ComponentID.fromString('my-scope/is-type@0.0.1'));
      };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component({ ...componentProps, loadFlattenedDependencies: load });
      expect(loaded).to.equal(0);
      expect(component.flattenedDependencies.toString()).to.equal('my-scope/is-type@0.0.1');
      expect(component.flattenedDependencies.toString()).to.equal('my-scope/is-type@0.0.1');
      expect(loaded).to.equal(1);
    });
    it('should throw on every read when the loading fails, not fall back to an empty list', () => {
      const load = () => {
        throw new Error('unable to find the object');
      };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component({ ...componentProps, loadFlattenedDependencies: load });
      expect(() => component.flattenedDependencies).to.throw('unable to find the object');
      expect(() => component.flattenedDependencies).to.throw('unable to find the object');
    });
    it('should default to an empty list and keep a list that was set', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component(componentProps);
      expect(component.flattenedDependencies).to.have.lengthOf(0);
      const ids = new ComponentIdList(ComponentID.fromString('my-scope/is-type@0.0.2'));
      component.flattenedDependencies = ids;
      expect(component.flattenedDependencies).to.equal(ids);
    });
  });
});
