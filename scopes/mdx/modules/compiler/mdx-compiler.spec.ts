import { join } from 'path';
import { readFileSync } from 'fs';
import { expect } from 'chai';
import { compile, DEFAULT_RENDERER } from './mdx-compiler';
import { CompileOutput } from './compile-output';

describe('MDXCompiler', () => {
  describe('compile()', () => {
    describe('simple file (mocks/simple.mdx)', () => {
      const simpleFile = readFileSync(join(__dirname, 'mocks', 'simple.mdx'), 'utf-8');

      let output: CompileOutput;
      beforeEach(async () => {
        output = await compile(simpleFile);
      });

      it('should extract the file title and labels from the file header', async () => {
        expect(output.getMetadata()).to.deep.eq({
          title: 'My Component',
          labels: ['first', 'component'],
        });
      });

      it('should compile the markdown into a react component and export as default', async () => {
        expect(output.contents).to.include('export default function MDXContent');
      });

      it('should not include the metadata in the compiled code', async () => {
        expect(output.contents).to.not.include('My Component');
        expect(output.contents).to.not.include(`['first', 'component']`);
      });

      it('should include the default renderer', () => {
        expect(output.contents).to.include(DEFAULT_RENDERER);
      });
    });

    describe('empty headers', () => {
      const emptyHeadersFile = readFileSync(join(__dirname, 'mocks', 'no-headers.mdx'), 'utf-8');

      let output: CompileOutput;
      beforeEach(async () => {
        output = await compile(emptyHeadersFile);
      });

      it('should not include any metadata', () => {
        expect(output.getMetadata()).to.be.undefined;
      });

      it('should compile the markdown into a react component and export as default', async () => {
        expect(output.contents).to.include('export default function MDXContent');
      });

      it('should include the mdx content in the component', () => {
        expect(output.contents).to.include('My very new component.');
      });
    });
  });
});
