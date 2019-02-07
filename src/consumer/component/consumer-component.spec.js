import { expect } from 'chai';
import withCompiler from '../../../fixtures/consumer-components/with-compiler/with-compiler.json';
import Component from './consumer-component';
import CompilerExtension from '../../extensions/compiler-extension';

describe('ConsumerComponent', () => {
  describe('fromString()', () => {
    describe('component with compiler', () => {
      let component;
      before(async () => {
        component = await Component.fromString(JSON.stringify(withCompiler));
      });
      it('should not crash and return a ConsumerComponent Object', async () => {
        expect(component).to.be.instanceOf(Component);
      });
      it('should convert the compiler object to a Compiler instance', () => {
        expect(component.compiler).to.be.instanceOf(CompilerExtension);
      });
    });
  });
});
