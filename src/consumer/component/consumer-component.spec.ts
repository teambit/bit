import { expect } from 'chai';
import Component from './consumer-component';
import { SourceFile } from './sources';

describe('ConsumerComponent', function () {
  // @ts-ignore
  this.timeout(0);
  describe('docs', () => {
    const componentProps = {
      name: 'is-string',
      mainFile: 'is-string.js',
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      files: [new SourceFile({ base: '.', path: 'is-string.js', contents: Buffer.from(''), test: false })],
    };
    it('should return an empty array when there is no docs', () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component(componentProps);
      expect(component.docs).to.deep.equal([]);
    });
  });
});
