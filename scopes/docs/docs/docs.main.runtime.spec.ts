import { expect } from 'chai';
import type { Component } from '@teambit/component';
import { Doc } from '@teambit/docs.entities.doc';
import { DocsMain } from './docs.main.runtime';
import type { DocReader } from './doc-reader';

function createDocsMain(docFiles: string[], docReader: DocReader) {
  const devFiles: any = { getDevFiles: () => ({ get: () => docFiles }) };
  const logger: any = { debug: () => {} };
  const docReaderSlot: any = { values: () => [docReader] };
  const args: any[] = [[], undefined, undefined, undefined, undefined, logger, devFiles, undefined, undefined];
  return new (DocsMain as any)(...args, docReaderSlot) as DocsMain;
}

function createComponent(filePaths: string[]): Component {
  const files = filePaths.map((relative) => ({ relative, extname: '.tsx', contents: Buffer.from('') }));
  return { state: { filesystem: { files } } } as any;
}

const failingReader: DocReader = {
  read: async () => {
    throw new Error('the compiled docs file is not in node_modules');
  },
  isFormatSupported: () => true,
};

describe('DocsMain.computeDocDataInScope', () => {
  it('should return undefined, to keep the stored doc, when a docs file exists but cannot be read', async () => {
    const docs = createDocsMain(['button.docs.tsx'], failingReader);
    expect(await docs.computeDocDataInScope(createComponent(['button.tsx', 'button.docs.tsx']))).to.be.undefined;
  });
  it('should return an empty doc when the component has no docs file', async () => {
    const docs = createDocsMain([], failingReader);
    expect(await docs.computeDocDataInScope(createComponent(['button.tsx']))).to.deep.equal({ doc: undefined });
  });
  it('should return the doc when the docs file is read', async () => {
    const reader: DocReader = {
      read: async (path: string) => Doc.from(path, { description: 'a button', displayName: 'Button' }),
      isFormatSupported: () => true,
    };
    const docs = createDocsMain(['button.docs.tsx'], reader);
    const data = await docs.computeDocDataInScope(createComponent(['button.tsx', 'button.docs.tsx']));
    expect(data?.doc?.filePath).to.equal('button.docs.tsx');
  });
});
