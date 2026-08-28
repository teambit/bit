import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import type { SchemaLocation, SchemaNode } from './schema-node';
import { APISchema } from './api-schema';
import {
  ExportSchema,
  ExpressionWithTypeArgumentsSchema,
  InferenceTypeSchema,
  InterfaceSchema,
  KeywordTypeSchema,
  ModuleSchema,
  ParameterSchema,
  ParenthesizedTypeSchema,
  TypeIntersectionSchema,
  TypeLiteralSchema,
  TypeRefSchema,
  TypeSchema,
  TypeUnionSchema,
  VariableLikeSchema,
} from './schemas';

const loc: SchemaLocation = { filePath: 'index.ts', line: 0, character: 0 };
const compId = ComponentID.fromString('org.scope/button');

function member(name: string, type = 'string', isOptional = true): VariableLikeSchema {
  return new VariableLikeSchema(loc, name, `${name}: ${type}`, new KeywordTypeSchema(loc, type), isOptional);
}

function iface(name: string, members: SchemaNode[], extendsNodes: ExpressionWithTypeArgumentsSchema[] = []) {
  return new InterfaceSchema(loc, name, `interface ${name}`, extendsNodes, members);
}

function literal(...members: SchemaNode[]) {
  return new TypeLiteralSchema(loc, members);
}

function extendsRef(name: string) {
  return new ExpressionWithTypeArgumentsSchema([], new TypeRefSchema(loc, name), name, loc);
}

const names = (nodes: SchemaNode[]) => nodes.map((node) => node.name);

describe('SchemaNode.getMembers()', () => {
  it('returns the members of an interface', () => {
    expect(names(iface('Props', [member('a'), member('b')]).getMembers())).to.deep.equal(['a', 'b']);
  });

  it('returns the members of a type literal', () => {
    expect(names(literal(member('a')).getMembers())).to.deep.equal(['a']);
  });

  it('contributes nothing for a type that is not object-like', () => {
    expect(new KeywordTypeSchema(loc, 'string').getMembers()).to.deep.equal([]);
  });

  it('combines the members of an intersection', () => {
    const intersection = new TypeIntersectionSchema(loc, [literal(member('a')), iface('B', [member('b')])]);
    expect(names(intersection.getMembers())).to.deep.equal(['a', 'b']);
  });

  it('lists the members of every alternative of a union', () => {
    const union = new TypeUnionSchema(loc, [literal(member('a'), member('shared')), literal(member('b'))]);
    expect(names(union.getMembers())).to.deep.equal(['a', 'shared', 'b']);
  });

  it('only keeps a union member required when every alternative requires it', () => {
    // `{ id: string; a: string } | { id: string; a?: string; b: string }`
    const union = new TypeUnionSchema(loc, [
      literal(member('id', 'string', false), member('a', 'string', false)),
      literal(member('id', 'string', false), member('a', 'string', true), member('b', 'string', false)),
    ]);
    const required = union.getMembers().map((m) => `${m.name}${(m as VariableLikeSchema).isOptional ? '?' : ''}`);
    expect(required).to.deep.equal(['id', 'a?', 'b?']);
  });

  it('unions the types the alternatives give one member', () => {
    // `{ value: string } | { value: number }`
    const union = new TypeUnionSchema(loc, [
      literal(member('value', 'string', false)),
      literal(member('value', 'number', false)),
    ]);
    const [value] = union.getMembers() as VariableLikeSchema[];
    expect(value.type.toString()).to.equal('string | number');
    expect(value.isOptional).to.equal(false);
  });

  it('lets a type shared by two branches contribute to each', () => {
    const base = iface('Base', [member('id', 'string', false)]);
    const shared = new TypeRefSchema(loc, 'Base');
    const union = new TypeUnionSchema(loc, [
      new TypeIntersectionSchema(loc, [shared, literal(member('a'))]),
      new TypeIntersectionSchema(loc, [shared, literal(member('b'))]),
    ]);
    const resolveRef = () => base;
    const members = union.getMembers({ resolveRef }) as VariableLikeSchema[];
    expect(names(members)).to.deep.equal(['id', 'a', 'b']);
    expect(members[0].isOptional).to.equal(false);
  });

  it('follows a type alias and parentheses to the underlying type', () => {
    const alias = new TypeSchema(loc, 'Props', new ParenthesizedTypeSchema(loc, literal(member('a'))), 'type Props');
    expect(names(alias.getMembers())).to.deep.equal(['a']);
  });

  it('follows an export wrapper to the exported declaration', () => {
    expect(names(new ExportSchema(loc, 'Props', iface('Props', [member('a')])).getMembers())).to.deep.equal(['a']);
  });

  it('resolves a reference through the context, and contributes nothing without one', () => {
    const ref = new TypeRefSchema(loc, 'Props');
    const target = iface('Props', [member('a')]);
    expect(names(ref.getMembers({ resolveRef: () => target }))).to.deep.equal(['a']);
    expect(ref.getMembers()).to.deep.equal([]);
  });

  it('includes the members an interface inherits, after its own', () => {
    const base = iface('Base', [member('a')]);
    const derived = iface('Props', [member('b')], [extendsRef('Base')]);
    const resolveRef = (ref: TypeRefSchema) => (ref.name === 'Base' ? base : undefined);
    expect(names(derived.getMembers({ resolveRef }))).to.deep.equal(['b', 'a']);
  });

  it('terminates on a self-referencing type', () => {
    const self = new TypeRefSchema(loc, 'Props');
    const alias = new TypeSchema(
      loc,
      'Props',
      new TypeIntersectionSchema(loc, [self, literal(member('a'))]),
      'type Props'
    );
    expect(names(alias.getMembers({ resolveRef: () => alias }))).to.deep.equal(['a']);
  });
});

describe('ModuleSchema.listExports() / listDeclarations()', () => {
  const namespace = new ModuleSchema(loc, [iface('Inner', [])], []);
  namespace.namespace = 'ns';
  const mod = new ModuleSchema(
    loc,
    [new ExportSchema(loc, 'Props', iface('Props', [])), namespace, iface('Other', [])],
    [iface('Internal', [])]
  );

  it('lists exports with wrappers and nested namespaces unwrapped', () => {
    expect(names(mod.listExports())).to.deep.equal(['Props', 'Inner', 'Other']);
  });

  it('lists internals after the exports', () => {
    expect(names(mod.listDeclarations())).to.deep.equal(['Props', 'Inner', 'Other', 'Internal']);
  });

  it('does not mutate the module', () => {
    mod.listExports();
    expect(mod.exports).to.have.lengthOf(3);
    expect(mod.exports[0]).to.be.instanceOf(ExportSchema);
  });
});

describe('APISchema.getMembersOf()', () => {
  function api(exports: SchemaNode[], internals: SchemaNode[] = [], internalModules: ModuleSchema[] = []) {
    return new APISchema(loc, new ModuleSchema(loc, exports, internals), internalModules, compId);
  }

  it('resolves references to exported and internal declarations of the component', () => {
    const schema = api(
      [new ExportSchema(loc, 'Props', iface('Props', [member('a')]))],
      [new TypeSchema(loc, 'FileInternal', literal(member('b')), 'type FileInternal')],
      [new ModuleSchema(loc, [], [new TypeSchema(loc, 'ModuleInternal', literal(member('c')), 'type ModuleInternal')])]
    );
    const props = new TypeIntersectionSchema(loc, [
      new TypeRefSchema(loc, 'Props'),
      new TypeRefSchema(loc, 'FileInternal'),
      new TypeRefSchema(loc, 'ModuleInternal'),
    ]);
    expect(names(schema.getMembersOf(props))).to.deep.equal(['a', 'b', 'c']);
  });

  it('resolves through an alias of a reference', () => {
    const schema = api([
      new TypeSchema(loc, 'Props', new TypeRefSchema(loc, 'Base'), 'type Props'),
      iface('Base', [member('a')]),
    ]);
    expect(names(schema.getMembersOf(new TypeRefSchema(loc, 'Props')))).to.deep.equal(['a']);
  });

  it('does not resolve references to other components or packages, even with a matching name', () => {
    const schema = api([iface('Props', [member('a')])]);
    const fromComponent = new TypeRefSchema(loc, 'Props', ComponentID.fromString('org.scope/other'));
    const fromPackage = new TypeRefSchema(loc, 'Props', undefined, 'react');
    expect(schema.getMembersOf(fromComponent)).to.deep.equal([]);
    expect(schema.getMembersOf(fromPackage)).to.deep.equal([]);
  });

  it('contributes nothing for an unknown reference', () => {
    expect(api([]).getMembersOf(new TypeRefSchema(loc, 'Missing'))).to.deep.equal([]);
  });

  it('resolves the name a declaration is exported under', () => {
    // `export { Props as ButtonProps }`
    const schema = api([new ExportSchema(loc, 'Props', iface('Props', [member('a')]), 'ButtonProps')]);
    expect(names(schema.getMembersOf(new TypeRefSchema(loc, 'ButtonProps')))).to.deep.equal(['a']);
  });

  it('follows an exported reference to the local declaration it points at', () => {
    // `const Button = ...; export default Button` — the export is a reference, the declaration is internal.
    const inButton: SchemaLocation = { filePath: 'button.tsx', line: 1, character: 1 };
    const button = new TypeSchema(inButton, 'Button', literal(member('a')), 'type Button');
    const schema = api(
      [new ExportSchema(loc, 'default', new TypeRefSchema(loc, 'Button', undefined, undefined, 'button.tsx'))],
      [button]
    );
    expect(schema.listExportedDeclarations()).to.deep.equal([button]);
  });

  it('resolves a file-internal reference only within its file', () => {
    const inButton: SchemaLocation = { filePath: 'button.tsx', line: 1, character: 1 };
    const inCard: SchemaLocation = { filePath: 'card.tsx', line: 1, character: 1 };
    const buttonProps = new TypeSchema(inButton, 'Props', literal(member('label')), 'type Props');
    const cardProps = new TypeSchema(inCard, 'Props', literal(member('title')), 'type Props');
    const schema = api(
      [],
      [],
      [new ModuleSchema(inCard, [], [cardProps]), new ModuleSchema(inButton, [], [buttonProps])]
    );

    const toButton = new TypeRefSchema(loc, 'Props', undefined, undefined, 'button.tsx');
    const toElsewhere = new TypeRefSchema(loc, 'Props', undefined, undefined, 'missing.tsx');
    expect(names(schema.getMembersOf(toButton))).to.deep.equal(['label']);
    expect(schema.getMembersOf(toElsewhere)).to.deep.equal([]);
  });
});

describe('ParameterSchema.getBindingDefaults()', () => {
  it('collects default values from destructured bindings, whatever node describes them', () => {
    const param = new ParameterSchema(loc, 'props', new TypeRefSchema(loc, 'Props'), false, undefined, undefined, [
      new InferenceTypeSchema(loc, 'number', 'size', '32'),
      new VariableLikeSchema(
        loc,
        'label',
        'label: string',
        new KeywordTypeSchema(loc, 'string'),
        true,
        undefined,
        "'hi'"
      ),
      new InferenceTypeSchema(loc, 'string', 'other'),
    ]);
    expect([...param.getBindingDefaults()]).to.deep.equal([
      ['size', '32'],
      ['label', "'hi'"],
    ]);
  });

  it('is empty for a parameter without bindings', () => {
    const param = new ParameterSchema(loc, 'props', new TypeRefSchema(loc, 'Props'), false);
    expect(param.getBindingDefaults().size).to.equal(0);
  });
});
