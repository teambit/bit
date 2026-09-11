import { expect } from 'chai';
import ts from 'typescript';
import type { ParameterDeclaration } from 'typescript';
import type { Location } from '@teambit/semantics.entities.semantic-schema';
import { KeywordTypeSchema, TypeLiteralSchema, VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import { ParameterTransformer } from './parameter';

const loc: Location = { filePath: 'button.tsx', line: 1, character: 1 };

function firstParameter(source: string): ParameterDeclaration {
  const file = ts.createSourceFile('button.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let param: ParameterDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (!param && ts.isParameter(node)) param = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!param) throw new Error('no parameter in source');
  return param;
}

function member(name: string, defaultValue?: string) {
  return new VariableLikeSchema(
    loc,
    name,
    `${name}?: string`,
    new KeywordTypeSchema(loc, 'string'),
    true,
    undefined,
    defaultValue
  );
}

// the paths under test resolve the binding from the already-extracted props type, so no tsserver is needed.
const context = {} as SchemaExtractorContext;

describe('ParameterTransformer.getObjectBindingNodes()', () => {
  it('carries the binding initializer onto the member of an inline props type', async () => {
    const param = firstParameter(`function Button({ text = 'click' }: { text?: string }) {}`);
    const propsType = new TypeLiteralSchema(loc, [member('text')]);

    const [binding] = (await ParameterTransformer.getObjectBindingNodes(param, propsType, context)) || [];

    expect(VariableLikeSchema.isVariableLikeSchema(binding)).to.equal(true);
    expect(binding.name).to.equal('text');
    expect((binding as VariableLikeSchema).defaultValue).to.equal(`'click'`);
    expect((binding as VariableLikeSchema).type.toString()).to.equal('string');
  });

  it('keys an aliased binding by the prop it destructures, not the local name', async () => {
    const param = firstParameter(`function Button({ text: label = 'click' }: { text?: string }) {}`);
    const propsType = new TypeLiteralSchema(loc, [member('text')]);

    const [binding] = (await ParameterTransformer.getObjectBindingNodes(param, propsType, context)) || [];

    expect(binding.name).to.equal('text');
    expect((binding as VariableLikeSchema).defaultValue).to.equal(`'click'`);
  });

  it('returns the member itself when the binding has no initializer', async () => {
    const param = firstParameter(`function Button({ text }: { text?: string }) {}`);
    const text = member('text');
    const propsType = new TypeLiteralSchema(loc, [text]);

    const [binding] = (await ParameterTransformer.getObjectBindingNodes(param, propsType, context)) || [];

    expect(binding).to.equal(text);
  });

  it('does not describe a parameter that is not an object binding pattern', async () => {
    const param = firstParameter(`function Button(props: { text?: string }) {}`);

    expect(await ParameterTransformer.getObjectBindingNodes(param, new TypeLiteralSchema(loc, []), context)).to.be
      .undefined;
  });
});
