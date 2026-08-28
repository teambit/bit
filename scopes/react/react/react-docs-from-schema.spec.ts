import { expect } from 'chai';
import type { Location as SchemaLocation, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import {
  APISchema,
  DocSchema,
  ExportSchema,
  ExpressionWithTypeArgumentsSchema,
  InterfaceSchema,
  KeywordTypeSchema,
  ModuleSchema,
  ParameterSchema,
  TypeIntersectionSchema,
  TypeLiteralSchema,
  TypeRefSchema,
  TypeSchema,
  TypeUnionSchema,
  VariableLikeSchema,
} from '@teambit/semantics.entities.semantic-schema';
import { ComponentID } from '@teambit/component-id';
import { ReactSchema } from './react.schema';
import { reactDocsFromSchema } from './react-docs-from-schema';

const loc: SchemaLocation = { filePath: 'index.ts', line: 0, character: 0 };
const compId = ComponentID.fromString('org.scope/button');

function member(name: string, type: string, isOptional: boolean, comment?: string): VariableLikeSchema {
  return new VariableLikeSchema(
    loc,
    name,
    `${name}: ${type}`,
    new KeywordTypeSchema(loc, type),
    isOptional,
    comment ? new DocSchema(loc, `/** ${comment} */`, comment) : undefined
  );
}

function reactNode(name: string, propsTypeName: string, bindings?: SchemaNode[]): ReactSchema {
  const props = new ParameterSchema(
    loc,
    'props',
    new TypeRefSchema(loc, propsTypeName),
    false,
    undefined,
    undefined,
    bindings
  );
  return new ReactSchema(loc, name, new TypeRefSchema(loc, 'JSX.Element'), props);
}

function apiSchema(exports: SchemaNode[], internals: SchemaNode[] = []): APISchema {
  return new APISchema(loc, new ModuleSchema(loc, exports, internals), [], compId);
}

describe('reactDocsFromSchema()', () => {
  it('returns undefined when the component exports no react component', () => {
    const api = apiSchema([new TypeSchema(loc, 'ButtonProps', new TypeLiteralSchema(loc, []), 'type ButtonProps')]);
    expect(reactDocsFromSchema(api)).to.be.undefined;
  });

  it('resolves props from a type alias to an object type', () => {
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeLiteralSchema(loc, [
        member('text', 'string', true, 'the button label'),
        member('onClick', 'function', false),
      ]),
      'type ButtonProps'
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps'), propsType]));

    expect(docs?.properties).to.have.lengthOf(2);
    expect(docs?.properties[0]).to.deep.include({
      name: 'text',
      type: 'string',
      description: 'the button label',
      required: false,
    });
    expect(docs?.properties[1]).to.deep.include({ name: 'onClick', required: true });
  });

  it('resolves props from an interface', () => {
    const propsType = new InterfaceSchema(
      loc,
      'ButtonProps',
      'interface ButtonProps',
      [],
      [member('text', 'string', true)]
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps'), propsType]));

    expect(docs?.properties.map((prop) => prop.name)).to.deep.equal(['text']);
  });

  it('resolves a props type that is internal rather than exported', () => {
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeLiteralSchema(loc, [member('text', 'string', true)]),
      'type ButtonProps'
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps')], [propsType]));

    expect(docs?.properties.map((prop) => prop.name)).to.deep.equal(['text']);
  });

  it('merges the members of an intersection and ignores references it cannot resolve', () => {
    // `type ButtonProps = { text?: string } & HTMLAttributes<HTMLDivElement>` — the second member
    // belongs to an external package, so this schema says nothing about it.
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeIntersectionSchema(loc, [
        new TypeLiteralSchema(loc, [member('text', 'string', true)]),
        new TypeRefSchema(loc, 'HTMLAttributes', undefined, 'react'),
      ]),
      'type ButtonProps'
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps'), propsType]));

    expect(docs?.properties.map((prop) => prop.name)).to.deep.equal(['text']);
  });

  it('takes default values from the destructured parameter', () => {
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeLiteralSchema(loc, [member('text', 'string', true)]),
      'type ButtonProps'
    );
    const binding = new VariableLikeSchema(
      loc,
      'text',
      'text: string',
      new KeywordTypeSchema(loc, 'string'),
      true,
      undefined,
      "'click me'"
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps', [binding]), propsType]));

    expect(docs?.properties[0].defaultValue).to.deep.equal({ value: "'click me'", computed: false });
  });

  it('unwraps export wrappers and describes the first component that has resolvable props', () => {
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeLiteralSchema(loc, [member('text', 'string', true)]),
      'type ButtonProps'
    );
    const withoutProps = reactNode('Spacer', 'UnknownProps');
    const withProps = reactNode('Button', 'ButtonProps');
    const api = apiSchema([
      new ExportSchema(loc, 'Spacer', withoutProps),
      new ExportSchema(loc, 'Button', withProps),
      propsType,
    ]);

    const docs = reactDocsFromSchema(api);
    expect(docs?.properties.map((prop) => prop.name)).to.deep.equal(['text']);
  });

  it('describes the component even when none of them have resolvable props', () => {
    const docs = reactDocsFromSchema(apiSchema([reactNode('Spacer', 'UnknownProps')]));

    expect(docs).to.not.be.undefined;
    expect(docs?.properties).to.deep.equal([]);
    expect(docs?.filePath).to.equal('index.ts');
  });

  it('includes the props an interface inherits through `extends`', () => {
    const base = new InterfaceSchema(
      loc,
      'BaseProps',
      'interface BaseProps',
      [],
      [member('className', 'string', true)]
    );
    const propsType = new InterfaceSchema(
      loc,
      'ButtonProps',
      'interface ButtonProps extends BaseProps',
      [new ExpressionWithTypeArgumentsSchema([], new TypeRefSchema(loc, 'BaseProps'), 'BaseProps', loc)],
      [member('text', 'string', true)]
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps'), propsType, base]));

    expect(docs?.properties.map((prop) => prop.name)).to.deep.equal(['text', 'className']);
  });

  it('lists the props of every alternative of a union, each name once', () => {
    // `type Props = { text?: string; variant?: string } | { icon?: string; variant?: string }`
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeUnionSchema(loc, [
        new TypeLiteralSchema(loc, [member('text', 'string', true), member('variant', 'string', true)]),
        new TypeLiteralSchema(loc, [member('icon', 'string', true), member('variant', 'string', true)]),
      ]),
      'type ButtonProps'
    );
    const docs = reactDocsFromSchema(apiSchema([reactNode('Button', 'ButtonProps'), propsType]));

    expect(docs?.properties.map((prop) => prop.name)).to.deep.equal(['text', 'variant', 'icon']);
  });

  it('describes a component exported by reference, as `export default Button` is', () => {
    const inButton: SchemaLocation = { filePath: 'button.tsx', line: 1, character: 1 };
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeLiteralSchema(loc, [member('text', 'string', true)]),
      'type ButtonProps'
    );
    const button = new ReactSchema(
      inButton,
      'Button',
      new TypeRefSchema(loc, 'JSX.Element'),
      new ParameterSchema(loc, 'props', new TypeRefSchema(loc, 'ButtonProps'), false)
    );
    const api = apiSchema(
      [
        new ExportSchema(loc, 'default', new TypeRefSchema(loc, 'Button', undefined, undefined, 'button.tsx')),
        propsType,
      ],
      [button]
    );

    expect(reactDocsFromSchema(api)?.properties.map((prop) => prop.name)).to.deep.equal(['text']);
  });

  it('describes a schema built by another copy of the semantic-schema package', () => {
    // such a schema carries the serialized fields but not this package's prototype methods, `toObject()` aside —
    // that is the contract between versions.
    const propsType = new TypeSchema(
      loc,
      'ButtonProps',
      new TypeLiteralSchema(loc, [member('text', 'string', true, 'the button label')]),
      'type ButtonProps'
    );
    const binding = new VariableLikeSchema(loc, 'text', 'text: string', new KeywordTypeSchema(loc, 'string'), true);
    const api = apiSchema([reactNode('Button', 'ButtonProps', [binding]), propsType]);
    const foreign = { ...api, toObject: () => api.toObject() } as unknown as APISchema;
    expect((foreign as any).getMembersOf).to.be.undefined;

    expect(reactDocsFromSchema(foreign)).to.deep.equal(reactDocsFromSchema(api));
    expect(reactDocsFromSchema(foreign)?.properties[0]).to.deep.include({
      name: 'text',
      description: 'the button label',
    });
  });

  it('exposes the component doc comment as the abstract', () => {
    const node = new ReactSchema(
      loc,
      'Button',
      new TypeRefSchema(loc, 'JSX.Element'),
      undefined,
      undefined,
      [],
      new DocSchema(loc, '/** a button */', 'a button')
    );

    expect(reactDocsFromSchema(apiSchema([node]))?.abstract).to.equal('a button');
  });
});
