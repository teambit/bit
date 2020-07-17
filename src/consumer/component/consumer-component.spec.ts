import { expect } from 'chai';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import withCompilerFixture from '../../../fixtures/consumer-components/with-compiler/with-compiler.json';
import Component from './consumer-component';
import CompilerExtension from '../../legacy-extensions/compiler-extension';
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
    it('should return the docs when a file has a jsdoc block', async () => {
      const src = `/**
      * is a given variable a string
      */
      function isString() {}`;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const sourceFile = new SourceFile({ base: '.', path: 'is-string.js', contents: Buffer.from(src), test: false });
      componentProps.files = [sourceFile];
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component(componentProps);
      await component.recalculateDocs();
      const docs = component.docs;
      expect(docs).to.have.lengthOf(1);
      expect(docs[0].description).to.equal('is a given variable a string');
    });
    it('should return the docs only for non-test files with jsdocs', async () => {
      const src = `/**
      * is a given variable a string
      */
      function isString() {}`;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const sourceFile = new SourceFile({ base: '.', path: 'is-string.js', contents: Buffer.from(src), test: false });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const sourceFileSpec = new SourceFile({
        base: '.',
        path: 'is-string.spec.js',
        contents: Buffer.from(src),
        test: true,
      });
      componentProps.files = [sourceFile, sourceFileSpec];
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const component = new Component(componentProps);
      await component.recalculateDocs();
      expect(component.docs).to.have.lengthOf(1);
    });
  });
});
