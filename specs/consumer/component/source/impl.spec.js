import fs from 'fs';
import { expect } from 'chai';
import sinon from 'sinon';
import Impl from '../../../../src/consumer/component/sources/impl';

describe('Impl', () => {
  describe('create', () => {
    it('should use a default template when failed to get a custom one', () => {
      const impl = Impl.create('my-component');
      expect(impl).to.be.an.instanceof(Impl);
      expect(impl.src).to.contain('myComponent');
    });
  });
  describe('write', () => {
    let sandbox;
    let impl;
    let writeFileStub;
    beforeEach(() => {
      sandbox = sinon.sandbox.create();
      writeFileStub = sandbox.stub(fs, 'writeFile', (path, content, callback) => callback(null));
      impl = Impl.create('my-component');
    });
    afterEach(() => {
      sandbox.restore();
    });
    it('should not write the file if it already exists', () => {
      sandbox.stub(fs, 'existsSync').returns(true);
      const result = impl.write('my-bit-path', 'my-component', false);
      return result
        .then(() => {
          expect(writeFileStub.called).to.be.false;
        });
    });
    it('should write the file if it does not exist', () => {
      sandbox.stub(fs, 'existsSync').returns(false);
      const result = impl.write('my-bit-path', 'my-component', false);
      return result
        .then(() => {
          expect(writeFileStub.calledOnce).to.be.true;
        });
    });
    it('should write the file anyway if "force" is enabled', () => {
      const result = impl.write('my-bit-path', 'my-component', true);
      return result
        .then(() => {
          expect(writeFileStub.calledOnce).to.be.true;
        });
    });
  });
});
