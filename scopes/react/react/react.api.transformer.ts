import type {
  ExpressionWithTypeArgumentsSchema,
  ParameterSchema,
  SchemaNode,
} from '@teambit/semantics.entities.semantic-schema';
import {
  ClassSchema,
  FunctionLikeSchema,
  ParameterSchema as Parameter,
  TypeRefSchema,
} from '@teambit/semantics.entities.semantic-schema';
import type { SchemaNodeTransformer } from '@teambit/typescript';
import { ReactSchema } from './react.schema';

const REACT_FILE_EXT = ['.tsx', '.jsx', '.js'];

const REACT_ELEMENT_TYPES = [
  'JSX.Element',
  'React.ReactNode',
  'null',
  'undefined',
  'React.ReactChild',
  'React.ReactFragment',
  'React.ReactPortal',
  'React.JSX.Element',
];

/**
 * `React.Component`, `Component`, `PureComponent` — with or without the namespace.
 */
const REACT_BASE_CLASS = /(^|\.)(Pure)?Component$/;

/**
 * turns the declarations that describe a React component into a `ReactSchema`: a function returning an
 * element, or a class extending React's component base classes.
 */
export class ReactAPITransformer implements SchemaNodeTransformer {
  predicate(node: SchemaNode) {
    if (node.__schema === FunctionLikeSchema.name) return this.isFunctionComponent(node as FunctionLikeSchema);
    if (node.__schema === ClassSchema.name) return Boolean(this.reactBaseOf(node as ClassSchema));
    return false;
  }

  async transform(node: FunctionLikeSchema | ClassSchema): Promise<SchemaNode> {
    if (node.__schema === ClassSchema.name) return this.transformClass(node as ClassSchema);
    return this.transformFunction(node as FunctionLikeSchema);
  }

  private isFunctionComponent(node: FunctionLikeSchema) {
    if (!this.isReactFile(node)) return false;
    if (node.params.length > 1) return false;
    return REACT_ELEMENT_TYPES.includes(this.getReturnTypeName(node));
  }

  private transformFunction(node: FunctionLikeSchema): ReactSchema {
    return new ReactSchema(
      node.location,
      node.name,
      new TypeRefSchema(node.returnType.location, this.getReturnTypeName(node), undefined, 'react'),
      node.params[0] as ParameterSchema<TypeRefSchema>,
      node.signature,
      node.modifiers,
      node.doc,
      node.typeParams
    );
  }

  /**
   * the props of a class component are the first type argument of its React base class:
   * `class Button extends React.Component<ButtonProps>`.
   */
  private transformClass(node: ClassSchema): ReactSchema {
    const base = this.reactBaseOf(node);
    const propsType = base?.typeArgs[0];
    const props = propsType
      ? (new Parameter(propsType.location, 'props', propsType, false) as ParameterSchema<TypeRefSchema>)
      : undefined;

    return new ReactSchema(
      node.location,
      node.name,
      new TypeRefSchema(node.location, 'React.ReactNode', undefined, 'react'),
      props,
      node.signature,
      [],
      node.doc,
      node.typeParams
    );
  }

  private reactBaseOf(node: ClassSchema): ExpressionWithTypeArgumentsSchema | undefined {
    if (!this.isReactFile(node)) return undefined;
    return node.extendsNodes?.find((base) => REACT_BASE_CLASS.test(base.name));
  }

  private isReactFile(node: SchemaNode) {
    return REACT_FILE_EXT.some((ext) => node.location.filePath.endsWith(ext));
  }

  private getReturnTypeName(node: FunctionLikeSchema): string {
    const returnType = node.returnType;
    return returnType.name ?? returnType.toString();
  }
}
