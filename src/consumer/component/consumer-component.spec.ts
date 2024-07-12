import { expect } from 'chai';
import Component from './consumer-component';
import { SourceFile } from '@teambit/component.sources';

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
});
