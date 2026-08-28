import { expect } from 'chai';
import type { Location as SchemaLocation } from '@teambit/semantics.entities.semantic-schema';
import {
  ClassSchema,
  ExpressionWithTypeArgumentsSchema,
  TypeRefSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { ReactSchema } from './react.schema';
import { ReactAPITransformer } from './react.api.transformer';

const inTsx: SchemaLocation = { filePath: 'button.tsx', line: 1, character: 1 };
const inTs: SchemaLocation = { filePath: 'store.ts', line: 1, character: 1 };
const inJs: SchemaLocation = { filePath: 'hero-button.js', line: 1, character: 1 };

function classExtending(base: string, propsType: string | undefined, location: SchemaLocation) {
  const typeArgs = propsType ? [new TypeRefSchema(location, propsType)] : [];
  const extendsNode = new ExpressionWithTypeArgumentsSchema(
    typeArgs,
    new TypeRefSchema(location, base, undefined, 'react'),
    base,
    location
  );
  return new ClassSchema('Button', [], location, `class Button extends ${base}`, undefined, undefined, [extendsNode]);
}

describe('ReactAPITransformer', () => {
  const transformer = new ReactAPITransformer();

  it('recognises a class extending React.Component and takes its props from the type argument', async () => {
    const node = classExtending('React.Component', 'ButtonProps', inTsx);

    expect(transformer.predicate(node)).to.equal(true);
    const react = (await transformer.transform(node)) as ReactSchema;
    expect(ReactSchema.isReactSchema(react)).to.equal(true);
    expect(react.name).to.equal('Button');
    expect(react.props?.type.name).to.equal('ButtonProps');
  });

  it('recognises PureComponent and an un-namespaced Component, in a .js file too', async () => {
    expect(transformer.predicate(classExtending('PureComponent', 'Props', inTsx))).to.equal(true);
    expect(transformer.predicate(classExtending('Component', undefined, inJs))).to.equal(true);
    const react = (await transformer.transform(classExtending('Component', undefined, inJs))) as ReactSchema;
    expect(react.props).to.be.undefined;
  });

  it('leaves other classes alone, including React-looking ones outside React files', () => {
    expect(transformer.predicate(classExtending('EventEmitter', undefined, inTsx))).to.equal(false);
    expect(transformer.predicate(classExtending('React.Component', 'Props', inTs))).to.equal(false);
    expect(transformer.predicate(new ClassSchema('Store', [], inTsx, 'class Store'))).to.equal(false);
  });
});
