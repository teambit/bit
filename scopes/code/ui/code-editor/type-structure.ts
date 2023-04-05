/* eslint-disable @typescript-eslint/no-unused-vars */
import Project, { Type, Node, TypeGuards } from 'ts-simple-ast';

export enum ParentShipKind {
  'name' = 'name',
  'type' = 'type',
  'body' = 'body',
  'literal' = 'literal',
  'expression' = 'expression',
  'value' = 'value',
  'parameter' = 'parameter',
  'variable' = 'variable',
  'tagName' = 'tagName',
  'block' = 'block',
  'externalModuleIndicator' = 'externalModuleIndicator',
  'importClause' = 'importClause',
  'namedBindings' = 'namedBindings',
  'propertyName' = 'propertyName',
  'moduleSpecifier' = 'moduleSpecifier',
  'nextContainer' = 'nextContainer',
  'declarationList' = 'declarationList',
  'initializer' = 'initializer',
  'openingElement' = 'openingElement',
  'attributes' = 'attributes',
  'head' = 'head',
  'closingElement' = 'closingElement',
  'endOfFileToken' = 'endOfFileToken',
}

/**
 * Special values
 */
enum ValueKind {
  'false' = 'false',
  'true' = 'true',
  'emptyString' = 'emptyString',
  'emptyArray' = 'emptyArray',
  'emptyObject' = 'emptyObject',
}

enum TypeBaseKind {
  number = 'number',
  boolean = 'boolean',
  string = 'string',
  function = 'function',
  array = 'array',
  object = 'object',
  undefined = 'undefined',
  null = 'null',
  regex = 'regex',
  class = 'class',
  interface = 'interface',
  enum = 'enum',
}

enum TypeTypeKind {
  'alias' = 'alias',
  'typed' = 'typed',
  'union' = 'union',
  'nullable' = 'nullable',
  'intersection' = 'intersection',
  'signature' = 'signature',
}

/**
 * How this type was declared (if) in the code?. It's similar to Inference but at the moment of writing code
 */
enum DeclarationKind {
  'literal' = 'literal',
  'declaredType' = 'explicitType',
  'noDeclaredType' = 'noDeclaration',
  'global' = 'global',
}

/**
 * How this a type was inference from a node. Basically one of TypeChecked method's
// 'getSignatureFromNode'=getSignatureFromNode'// getSignatureFromNode, 
|'returnTypeOfSignature'  
 */
enum TypeInferenceKind {
  'apparent' = 'apparent',
  'contextual' = 'contextual',
  'getTypeOfSymbolAtLocation' = 'getTypeOfSymbolAtLocation',
  'getTypeAtLocation' = 'getTypeAtLocation',
}

enum UsageKind {
  'callable' = 'callable',
  'constructor' = 'constructor',
  'iterable' = 'iterable',
  'keymap' = 'keymap',
  'membered' = 'membered',
}

enum ReferenceKind {
  'return' = 'return',
  'parameter' = 'parameter',
  'valued' = 'valued',
  'nonValued' = 'nonValued',
  'reference' = 'reference',
  'externalFileReference' = 'externalFileReference',
  'externalProjectReference' = 'externalProjectReference',
}

// export type TypeCharacteristics = BaseTypeNames | NonBaseTypeNames | ValuedTypeNames | TypeTypes | ReferenceTypeName;

/** A non strict way of representing several aspect of a type (like in a TypeNode in a TypeScript AST).
 *
 * This is a practical/heuristic definition that tries to describe easily and in the same place description of a
 * particular AST Node, not only from the POV of the type-checking, but also from the POV of user,neighbour nodes,
 * values, ,declarations, references, etc. This is more than the Type definition.
 *
 * In this interface we describe all of this, but without associating the desribed node with others, just in asolation.
 *
 */
export interface ITypeDescription {
  baseKind: TypeBaseKind[];
  parentShipKind: ParentShipKind[];
  valueKind: ValueKind[];
  typeKind: TypeTypeKind[];
  declarationKind: DeclarationKind[];
  referenceKind: ReferenceKind[];
  usageKind: UsageKind[];
}

interface BaseOptions {
  node: Node;
  project: Project;
}
interface BuildMemberOptions extends BaseOptions {
  type: Type;
}
interface TypeDescriptionCreateOptions extends BaseOptions {
  type?: Type;
  /** method to get a node's type - on method of typechecker */
  inferenceMode?: TypeInferenceKind;
}

export class TypeDescription implements ITypeDescription {
  private _baseKind: TypeBaseKind[] | undefined;
  public get baseKind(): TypeBaseKind[] {
    if (!this._baseKind) {
      this._baseKind = buildBaseKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._baseKind;
  }
  protected _parentShipKind: ParentShipKind[] = [];
  public get parentShipKind(): ParentShipKind[] {
    if (!this._parentShipKind) {
      this._parentShipKind = buildParentShipKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._parentShipKind;
  }
  protected _valueKind: ValueKind[] = [];
  public get valueKind(): ValueKind[] {
    if (!this._valueKind) {
      this._valueKind = buildValueKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._valueKind;
  }
  protected _typeKind: TypeTypeKind[] = [];
  public get typeKind(): TypeTypeKind[] {
    if (!this._typeKind) {
      this._typeKind = buildTypeTypeKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._typeKind;
  }
  protected _declarationKind: DeclarationKind[] = [];
  public get declarationKind(): DeclarationKind[] {
    if (!this._declarationKind) {
      this._declarationKind = buildDeclarationKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._declarationKind;
  }
  protected _referenceKind: ReferenceKind[] = [];
  public get referenceKind(): ReferenceKind[] {
    if (!this._referenceKind) {
      this._referenceKind = buildReferenceKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._referenceKind;
  }
  protected _usageKind: UsageKind[] = [];
  public get usageKind(): UsageKind[] {
    if (!this._usageKind) {
      this._usageKind = buildUsageKind({ node: this.node, type: this.type, project: this.project });
    }
    return this._usageKind;
  }
  protected type: Type;
  protected node: Node;
  protected project: Project;

  fullyQualifiedSymbol?: string;

  constructor(config: TypeDescriptionCreateOptions) {
    this.type = buildTypeFor(config);
    this.node = config.node;
    this.project = config.project;
  }
  protected checkBuild(): any {
    throw new Error('Method not implemented.');
  }
}

export function buildUsageKind({ node, type, project }: BuildMemberOptions): UsageKind[] {
  throw new Error('TODO ');
}

export function buildDeclarationKind({ node, type }: BuildMemberOptions): DeclarationKind[] {
  const c: DeclarationKind[] = [];
  if (type.isLiteral) {
    c.push(DeclarationKind.literal);
  }
  if (node.getType().getSymbol()) {
    c.push(DeclarationKind.declaredType);
  } else {
    c.push(DeclarationKind.noDeclaredType);
  }

  // TODO: 'global' = 'global'
  return c;
}

export function buildValueKind({ node, type, project }: BuildMemberOptions): ValueKind[] {
  throw new Error('TODO ');
}

export function buildReferenceKind({ node, type, project }: BuildMemberOptions): ReferenceKind[] {
  throw new Error('TODO ');
}

export function buildTypeTypeKind({ node, type, project }: BuildMemberOptions): TypeTypeKind[] {
  throw new Error('TODO ');
}

export function buildBaseKindOfNode(options: TypeDescriptionCreateOptions): TypeBaseKind[] {
  const type = buildTypeFor(options);
  return buildBaseKind({ ...options, type });
}

export function buildBaseKind({ type }: BuildMemberOptions): TypeBaseKind[] {
  const c: TypeBaseKind[] = [];
  if (type.isArray()) {
    c.push(TypeBaseKind.array);
  }
  if (type.isBoolean()) {
    c.push(TypeBaseKind.boolean);
  }
  if (type.isClass()) {
    c.push(TypeBaseKind.class);
  }
  if (type.isInterface()) {
    c.push(TypeBaseKind.interface);
  }
  if (type.isString()) {
    c.push(TypeBaseKind.string);
  }
  if (type.isEnum()) {
    c.push(TypeBaseKind.enum);
  }
  if (type.isNull()) {
    c.push(TypeBaseKind.null);
  }
  if (type.isUndefined()) {
    c.push(TypeBaseKind.undefined);
  }
  if (type.isUndefined()) {
    c.push(TypeBaseKind.undefined);
  }
  if (type.isObject()) {
    c.push(TypeBaseKind.object);
  }
  if (type.isArray()) {
    c.push(TypeBaseKind.array);
  }
  // TODO
  return c;
}

// export function buildParentShipKindOfNode(options: TypeDescriptionCreateOptions): ParentShipKind[] {
//   const type = buildTypeFor(options)
//   return buildParentShipKind({ ...options, type })
// }
// const parentShipwhiteList = enumKeys(ParentShipKind)//.map(p => p.toLowerCase())

export function buildParentShipKind({ node }: Partial<BuildMemberOptions> & { node: Node }): ParentShipKind[] {
  const r = extractParentPropertiesForChild(node);

  // we should filter but won't because want to be faster
  // .map(p => {
  //   const i = parentShipwhiteList.indexOf(p)//.toLowerCase())
  //   if (i != -1) {
  //     return parentShipwhiteList[i] as any
  //   }
  //   else {
  //     console.warn('parentShipwhiteList', p, 'not supported');

  //   }
  // })
  // .filter(p => p)
  return r as any;
}

function extractParentPropertiesForChild(node: Node): string[] | undefined {
  const parent = node.getParent() && node.getParent().compilerNode;
  if (parent) {
    return Object.keys(parent).filter((key) => (parent as any)[key] === node.compilerNode);
  }
  return [];
}

export function buildTypeFor(config: TypeDescriptionCreateOptions): Type {
  const t = config.type || config.node.getType(); // tryTo(()=>config.node.getType())||undefined
  if ((t && !config.inferenceMode) || config.inferenceMode === 'apparent') {
    return t.getApparentType();
  }
  if (config.inferenceMode === 'contextual') {
    if (TypeGuards.isExpression(config.node)) {
      const tt = config.project.getTypeChecker().getContextualType(config.node);
      if (tt) {
        return tt;
      }

      throw new Error('cannot build contextual type of given node');
    } else throw new Error('contextual inference requires an expression node');
  } else {
    throw new Error('TODO - WIP - Not supported inference, yet');
  }
}
