import { expect } from 'chai';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import withCompilerFixture from '../../../fixtures/consumer-components/with-compiler/with-compiler.json';
import CompilerExtension from '../../legacy-extensions/compiler-extension';
import Component from './consumer-component';
import { SourceFile } from './sources';

describe('ConsumerComponent', function () {
  this.timeout(0);
  describe('fromString()', () => {
    describe('component with compiler', () => {
      let component;
      before(async () => {
        component = await Component.fromString(JSON.stringify(withCompilerFixture));
      });
      it('should not crash and return a ConsumerComponent Object', async () => {
        expect(component).to.be.instanceOf(Component);
      });
      it('should convert the compiler object to a Compiler instance', () => {
        expect(component.compiler).to.be.instanceOf(CompilerExtension);
      });
    });
  });
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
