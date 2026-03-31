/* eslint-disable complexity */
import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import type { SchemaChangeFact } from '../schema-diff';
import { typesAreSemanticallyEqual, typeStr, deepEqualNoLocation, diffDoc } from '../schema-diff';
import { ParameterSchema } from './parameter';
import { DocSchema } from './docs';
import { TagName } from './docs/tag';
import { SchemaRegistry } from '../schema-registry';

export type Modifier =
  | 'static'
  | 'public'
  | 'private'
  | 'protected'
  | 'readonly'
  | 'abstract'
  | 'async'
  | 'override'
  | 'export';

/**
 * function-like can be a function, method, arrow-function, variable-function, etc.
 */
export class FunctionLikeSchema extends SchemaNode {
  readonly returnType: SchemaNode;
  readonly params: ParameterSchema[];
  readonly doc?: DocSchema;
  readonly signature?: string | undefined;
  readonly displaySchemaName = 'Functions';

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    params: ParameterSchema[],
    returnType: SchemaNode,
    signature: string,
    readonly modifiers: Modifier[] = [],
    doc?: DocSchema,
    readonly typeParams?: string[],
    readonly decorators?: SchemaNode[]
  ) {
    super();
    this.params = params;
    this.returnType = returnType;
    this.doc = doc;
    this.signature = signature || FunctionLikeSchema.createSignature(this.name, this.params, this.returnType);
  }

  getNodes() {
    return [...this.params, this.returnType, ...(this.decorators || [])];
  }

  toString(options?: { color?: boolean }) {
    const bold = options?.color ? chalk.bold : (text: string) => text;
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    const decoratorsStr = this.decorators?.map((decorator) => decorator.toString(options)).join('\n');
    return `${this.decorators ? `${decoratorsStr}\n` : ''}${this.modifiersToString()}${typeParamsStr}${bold(
      this.name
    )}(${paramsStr}): ${this.returnType.toString(options)}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';
    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }
    const decoratorsStr = this.decorators?.map((decorator) => decorator.toString()).join('\n');
    if (decoratorsStr) {
      result += `${decoratorsStr}\n`;
    }
    const modifiersStr = this.modifiersToString();
    const typeParamsStr = this.typeParams ? `<${this.typeParams.join(', ')}>` : '';
    const paramsStr = this.params
      .map((param) => {
        let paramStr = '';
        if (param.isSpread) {
          paramStr += '...';
        }
        paramStr += param.name;
        if (param.isOptional) {
          paramStr += '?';
        }
        paramStr += `: ${param.type.toString()}`;
        if (param.defaultValue !== undefined) {
          paramStr += ` = ${param.defaultValue}`;
        }
        return paramStr;
      })
      .join(', ');
    result += `${modifiersStr}${this.name}${typeParamsStr}(${paramsStr}): ${this.returnType.toString()}`;
    return result;
  }

  isDeprecated(): boolean {
    return Boolean(this.doc?.hasTag(TagName.deprecated));
  }

  isPrivate(): boolean {
    return Boolean(this.modifiers.find((m) => m === 'private') || this.doc?.hasTag(TagName.private));
  }

  generateSignature(): string {
    return FunctionLikeSchema.createSignature(this.name, this.params, this.returnType, this.decorators);
  }

  static createSignature(
    name: string,
    params: ParameterSchema[],
    returnType: SchemaNode,
    decorators?: SchemaNode[]
  ): string {
    const paramsStr = params
      .map((param) => {
        let type = param.type.toString();
        if (param.isSpread) type = `...${type}`;
        return `${param.name}${param.isOptional ? '?' : ''}: ${type}`;
      })
      .join(', ');
    const decoratorsStr = decorators?.map((decorator) => decorator.toString()).join('\n');
    return `${decorators ? `${decoratorsStr}\n` : ''}${name}(${paramsStr}): ${returnType.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      params: this.params.map((param) => param.toObject()),
      returnType: this.returnType.toObject(),
      signature: this.signature,
      modifiers: this.modifiers,
      doc: this.doc?.toObject(),
      typeParams: this.typeParams,
      decorators: this.decorators?.map((decorator) => decorator.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>) {
    return new FunctionLikeSchema(
      obj.location,
      obj.name,
      obj.params.map((param: Record<string, any>) => ParameterSchema.fromObject(param)),
      SchemaRegistry.fromObject(obj.returnType),
      obj.signature,
      obj.modifiers,
      obj.doc ? DocSchema.fromObject(obj.doc) : undefined,
      obj.typeParams,
      obj.decorators?.map((decorator) => SchemaRegistry.fromObject(decorator))
    );
  }

  diff(other: SchemaNode): SchemaChangeFact[] {
    if (!(other instanceof FunctionLikeSchema)) return super.diff(other);
    const facts: SchemaChangeFact[] = [];
    const baseObj = this.toObject();
    const compareObj = other.toObject();

    // Parameters: added/removed
    const baseParams = baseObj.params || [];
    const compareParams = compareObj.params || [];

    if (compareParams.length > baseParams.length) {
      for (const p of compareParams.slice(baseParams.length)) {
        const isOpt = p.isOptional || p.defaultValue !== undefined;
        facts.push({
          changeKind: 'parameter-added',
          description: `parameter '${p.name}: ${typeStr(p.type)}' added${isOpt ? ' (optional)' : ' (required)'}`,
          context: {
            paramName: p.name,
            isOptional: !!p.isOptional,
            hasDefault: p.defaultValue !== undefined,
            paramType: typeStr(p.type),
          },
          to: `${p.name}${p.isOptional ? '?' : ''}: ${typeStr(p.type)}`,
        });
      }
    }
    if (baseParams.length > compareParams.length) {
      for (const p of baseParams.slice(compareParams.length)) {
        facts.push({
          changeKind: 'parameter-removed',
          description: `parameter '${p.name}: ${typeStr(p.type)}' removed`,
          context: { paramName: p.name, isOptional: !!p.isOptional, paramType: typeStr(p.type) },
          from: `${p.name}${p.isOptional ? '?' : ''}: ${typeStr(p.type)}`,
        });
      }
    }

    // Parameters: compare overlapping
    const minLen = Math.min(baseParams.length, compareParams.length);
    for (let i = 0; i < minLen; i++) {
      const bp = baseParams[i];
      const cp = compareParams[i];

      const isDestructured = bp.objectBindingNodes || cp.objectBindingNodes;
      if (isDestructured) {
        FunctionLikeSchema.diffDestructuredParam(bp, cp, facts);
        if (!typesAreSemanticallyEqual(bp.type, cp.type)) {
          facts.push({
            changeKind: 'parameter-type-changed',
            description: `parameter at position ${i} type changed: ${typeStr(bp.type)} → ${typeStr(cp.type)}`,
            context: {
              paramName: cp.name || bp.name,
              fromType: typeStr(bp.type),
              toType: typeStr(cp.type),
              position: 'parameter',
            },
            from: typeStr(bp.type),
            to: typeStr(cp.type),
          });
        }
        continue;
      }

      const typeEqual = typesAreSemanticallyEqual(bp.type, cp.type);
      const nameEqual = bp.name === cp.name;
      const optEqual = bp.isOptional === cp.isOptional;
      const defaultEqual = bp.defaultValue === cp.defaultValue;
      if (nameEqual && typeEqual && optEqual && defaultEqual) continue;

      const paramName = cp.name || bp.name;
      if (!nameEqual) {
        facts.push({
          changeKind: 'parameter-renamed',
          description: `parameter at position ${i} renamed: '${bp.name}' → '${cp.name}'`,
          context: { fromName: bp.name, toName: cp.name, position: i },
          from: bp.name,
          to: cp.name,
        });
      }
      if (!typeEqual) {
        facts.push({
          changeKind: 'parameter-type-changed',
          description: `parameter '${paramName}' type changed: ${typeStr(bp.type)} → ${typeStr(cp.type)}`,
          context: { paramName, fromType: typeStr(bp.type), toType: typeStr(cp.type), position: 'parameter' },
          from: typeStr(bp.type),
          to: typeStr(cp.type),
        });
      }
      if (bp.isOptional && !cp.isOptional) {
        facts.push({
          changeKind: 'became-required',
          description: `parameter '${paramName}' became required (was optional)`,
          context: { paramName, position: 'parameter' },
          from: 'optional',
          to: 'required',
        });
      } else if (!bp.isOptional && cp.isOptional) {
        facts.push({
          changeKind: 'became-optional',
          description: `parameter '${paramName}' became optional (was required)`,
          context: { paramName, position: 'parameter' },
          from: 'required',
          to: 'optional',
        });
      }
      if (!defaultEqual) {
        if (bp.defaultValue !== undefined && cp.defaultValue === undefined) {
          facts.push({
            changeKind: 'parameter-default-removed',
            description: `parameter '${paramName}' default value removed (was: ${bp.defaultValue})`,
            context: { paramName, isOptional: !!bp.isOptional, previousDefault: String(bp.defaultValue) },
            from: String(bp.defaultValue),
          });
        } else if (bp.defaultValue === undefined && cp.defaultValue !== undefined) {
          facts.push({
            changeKind: 'parameter-default-added',
            description: `parameter '${paramName}' default value added: ${cp.defaultValue}`,
            context: { paramName, newDefault: String(cp.defaultValue) },
            to: String(cp.defaultValue),
          });
        } else {
          facts.push({
            changeKind: 'parameter-default-changed',
            description: `parameter '${paramName}' default value changed: ${bp.defaultValue} → ${cp.defaultValue}`,
            context: { paramName, previousDefault: String(bp.defaultValue), newDefault: String(cp.defaultValue) },
            from: String(bp.defaultValue),
            to: String(cp.defaultValue),
          });
        }
      }
    }

    // Return type
    if (!typesAreSemanticallyEqual(baseObj.returnType, compareObj.returnType)) {
      const fromType = typeStr(baseObj.returnType);
      const toType = typeStr(compareObj.returnType);
      facts.push({
        changeKind: 'return-type-changed',
        description: `return type changed: ${fromType} → ${toType}`,
        context: { fromType, toType, position: 'return-type' },
        from: fromType,
        to: toType,
      });
    }

    // Type parameters
    if (!deepEqualNoLocation(baseObj.typeParams, compareObj.typeParams)) {
      facts.push({
        changeKind: 'type-parameters-changed',
        description: `type parameters changed: <${(baseObj.typeParams || []).join(', ') || 'none'}> → <${(compareObj.typeParams || []).join(', ') || 'none'}>`,
        context: { from: (baseObj.typeParams || []).join(', '), to: (compareObj.typeParams || []).join(', ') },
        from: (baseObj.typeParams || []).join(', '),
        to: (compareObj.typeParams || []).join(', '),
      });
    }

    // Modifiers
    const baseMods = (this.modifiers || []).filter((m) => m !== 'export');
    const compareMods = (other.modifiers || []).filter((m) => m !== 'export');
    if (!deepEqualNoLocation(baseMods, compareMods)) {
      const added = compareMods.filter((m) => !baseMods.includes(m));
      const removed = baseMods.filter((m) => !compareMods.includes(m));
      const parts: string[] = [];
      if (added.length) parts.push(`added: ${added.join(', ')}`);
      if (removed.length) parts.push(`removed: ${removed.join(', ')}`);
      const accessNarrowed = removed.includes('public') || added.includes('private') || added.includes('protected');
      if (accessNarrowed) {
        facts.push({
          changeKind: 'access-narrowed',
          description: `modifiers changed (${parts.join('; ')})`,
          context: { added, removed, accessNarrowed: true },
          from: baseMods.join(', ') || 'none',
          to: compareMods.join(', ') || 'none',
        });
      } else {
        facts.push({
          changeKind: 'modifiers-changed',
          description: `modifiers changed (${parts.join('; ')})`,
          context: { added, removed, accessNarrowed: false },
          from: baseMods.join(', ') || 'none',
          to: compareMods.join(', ') || 'none',
        });
      }
    }

    facts.push(...diffDoc(baseObj.doc, compareObj.doc));
    return facts;
  }

  private static diffDestructuredParam(
    base: Record<string, any>,
    compare: Record<string, any>,
    facts: SchemaChangeFact[]
  ): void {
    const baseBindings: Record<string, any>[] = base.objectBindingNodes || [];
    const compareBindings: Record<string, any>[] = compare.objectBindingNodes || [];
    const baseMap = new Map(baseBindings.map((b) => [b.name || '', b]));
    const compareMap = new Map(compareBindings.map((b) => [b.name || '', b]));

    for (const [name] of compareMap) {
      if (!baseMap.has(name)) {
        facts.push({
          changeKind: 'destructured-property-added',
          description: `destructured property '${name}' added`,
          context: { propertyName: name },
          to: name,
        });
      }
    }
    for (const [name] of baseMap) {
      if (!compareMap.has(name)) {
        facts.push({
          changeKind: 'destructured-property-removed',
          description: `destructured property '${name}' removed`,
          context: { propertyName: name },
          from: name,
        });
      }
    }
    for (const [name, bb] of baseMap) {
      const cb = compareMap.get(name);
      if (!cb) continue;
      if (bb.defaultValue !== cb.defaultValue) {
        if (bb.defaultValue !== undefined && cb.defaultValue === undefined) {
          facts.push({
            changeKind: 'destructured-property-default-removed',
            description: `destructured property '${name}' default value removed (was: ${bb.defaultValue})`,
            context: { propertyName: name, isOptional: !!base.isOptional, previousDefault: String(bb.defaultValue) },
            from: String(bb.defaultValue),
          });
        } else if (bb.defaultValue === undefined && cb.defaultValue !== undefined) {
          facts.push({
            changeKind: 'destructured-property-default-added',
            description: `destructured property '${name}' default value added: ${cb.defaultValue}`,
            context: { propertyName: name, newDefault: String(cb.defaultValue) },
            to: String(cb.defaultValue),
          });
        } else {
          facts.push({
            changeKind: 'destructured-property-default-changed',
            description: `destructured property '${name}' default value changed: ${bb.defaultValue} → ${cb.defaultValue}`,
            context: {
              propertyName: name,
              previousDefault: String(bb.defaultValue),
              newDefault: String(cb.defaultValue),
            },
            from: String(bb.defaultValue),
            to: String(cb.defaultValue),
          });
        }
      }
      if (bb.type && cb.type && !typesAreSemanticallyEqual(bb.type, cb.type)) {
        facts.push({
          changeKind: 'destructured-property-type-changed',
          description: `destructured property '${name}' type changed: ${typeStr(bb.type)} → ${typeStr(cb.type)}`,
          context: { propertyName: name, fromType: typeStr(bb.type), toType: typeStr(cb.type), position: 'parameter' },
          from: typeStr(bb.type),
          to: typeStr(cb.type),
        });
      }
    }
  }

  private modifiersToString() {
    const modifiersToPrint = this.modifiers.filter((modifier) => modifier !== 'export');
    return modifiersToPrint.length ? `${modifiersToPrint.join(' ')} ` : '';
  }
}
