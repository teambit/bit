/* eslint-disable complexity */
import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import type { SchemaChangeDetail } from '../schema-diff';
import {
  SchemaChangeImpact,
  typesAreSemanticallyEqual,
  typeStr,
  returnTypeImpact,
  paramTypeImpact,
  deepEqualNoLocation,
  diffDoc,
} from '../schema-diff';
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

  diff(other: SchemaNode): SchemaChangeDetail[] {
    if (!(other instanceof FunctionLikeSchema)) return super.diff(other);
    const details: SchemaChangeDetail[] = [];
    const baseObj = this.toObject();
    const compareObj = other.toObject();

    // Parameters: added/removed
    const baseParams = baseObj.params || [];
    const compareParams = compareObj.params || [];

    if (compareParams.length > baseParams.length) {
      for (const p of compareParams.slice(baseParams.length)) {
        const isOpt = p.isOptional || p.defaultValue !== undefined;
        details.push({
          aspect: 'parameters',
          description: `parameter '${p.name}: ${typeStr(p.type)}' added${isOpt ? ' (optional)' : ' (required — breaks existing callers)'}`,
          impact: isOpt ? SchemaChangeImpact.NON_BREAKING : SchemaChangeImpact.BREAKING,
          to: `${p.name}${p.isOptional ? '?' : ''}: ${typeStr(p.type)}`,
        });
      }
    }
    if (baseParams.length > compareParams.length) {
      for (const p of baseParams.slice(compareParams.length)) {
        details.push({
          aspect: 'parameters',
          description: `parameter '${p.name}: ${typeStr(p.type)}' removed — callers passing this argument will break`,
          impact: SchemaChangeImpact.BREAKING,
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
        FunctionLikeSchema.diffDestructuredParam(bp, cp, details);
        if (!typesAreSemanticallyEqual(bp.type, cp.type)) {
          details.push({
            aspect: 'parameters',
            description: `parameter at position ${i} type changed: ${typeStr(bp.type)} → ${typeStr(cp.type)}`,
            impact: paramTypeImpact(typeStr(bp.type), typeStr(cp.type)),
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
        details.push({
          aspect: 'parameters',
          description: `parameter at position ${i} renamed: '${bp.name}' → '${cp.name}'`,
          impact: SchemaChangeImpact.PATCH,
          from: bp.name,
          to: cp.name,
        });
      }
      if (!typeEqual) {
        details.push({
          aspect: 'parameters',
          description: `parameter '${paramName}' type changed: ${typeStr(bp.type)} → ${typeStr(cp.type)}`,
          impact: paramTypeImpact(typeStr(bp.type), typeStr(cp.type)),
          from: typeStr(bp.type),
          to: typeStr(cp.type),
        });
      }
      if (bp.isOptional && !cp.isOptional) {
        details.push({
          aspect: 'parameters',
          description: `parameter '${paramName}' became required (was optional) — callers omitting it will break`,
          impact: SchemaChangeImpact.BREAKING,
          from: 'optional',
          to: 'required',
        });
      } else if (!bp.isOptional && cp.isOptional) {
        details.push({
          aspect: 'parameters',
          description: `parameter '${paramName}' became optional (was required)`,
          impact: SchemaChangeImpact.NON_BREAKING,
          from: 'required',
          to: 'optional',
        });
      }
      if (!defaultEqual) {
        details.push({
          aspect: 'parameters',
          description: `parameter '${paramName}' default value changed: ${bp.defaultValue ?? 'none'} → ${cp.defaultValue ?? 'none'}`,
          impact: SchemaChangeImpact.PATCH,
          from: bp.defaultValue !== undefined ? String(bp.defaultValue) : undefined,
          to: cp.defaultValue !== undefined ? String(cp.defaultValue) : undefined,
        });
      }
    }

    // Return type
    if (!typesAreSemanticallyEqual(baseObj.returnType, compareObj.returnType)) {
      const fromType = typeStr(baseObj.returnType);
      const toType = typeStr(compareObj.returnType);
      const impact = returnTypeImpact(fromType, toType);
      const verb = impact === SchemaChangeImpact.NON_BREAKING ? 'widened' : 'changed';
      details.push({
        aspect: 'return-type',
        description: `return type ${verb}: ${fromType} → ${toType}`,
        impact,
        from: fromType,
        to: toType,
      });
    }

    // Type parameters
    if (!deepEqualNoLocation(baseObj.typeParams, compareObj.typeParams)) {
      details.push({
        aspect: 'type-parameters',
        description: `type parameters changed: <${(baseObj.typeParams || []).join(', ') || 'none'}> → <${(compareObj.typeParams || []).join(', ') || 'none'}>`,
        impact: SchemaChangeImpact.BREAKING,
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
      details.push({
        aspect: 'modifiers',
        description: `modifiers changed (${parts.join('; ')})`,
        impact: accessNarrowed ? SchemaChangeImpact.BREAKING : SchemaChangeImpact.PATCH,
        from: baseMods.join(', ') || 'none',
        to: compareMods.join(', ') || 'none',
      });
    }

    details.push(...diffDoc(baseObj.doc, compareObj.doc));
    return details;
  }

  private static diffDestructuredParam(
    base: Record<string, any>,
    compare: Record<string, any>,
    details: SchemaChangeDetail[]
  ): void {
    const baseBindings: Record<string, any>[] = base.objectBindingNodes || [];
    const compareBindings: Record<string, any>[] = compare.objectBindingNodes || [];
    const baseMap = new Map(baseBindings.map((b) => [b.name || '', b]));
    const compareMap = new Map(compareBindings.map((b) => [b.name || '', b]));

    for (const [name] of compareMap) {
      if (!baseMap.has(name)) {
        details.push({
          aspect: 'parameters',
          description: `destructured property '${name}' added`,
          impact: SchemaChangeImpact.NON_BREAKING,
          to: name,
        });
      }
    }
    for (const [name] of baseMap) {
      if (!compareMap.has(name)) {
        details.push({
          aspect: 'parameters',
          description: `destructured property '${name}' removed`,
          impact: SchemaChangeImpact.BREAKING,
          from: name,
        });
      }
    }
    for (const [name, bb] of baseMap) {
      const cb = compareMap.get(name);
      if (!cb) continue;
      if (bb.defaultValue !== cb.defaultValue) {
        if (bb.defaultValue !== undefined && cb.defaultValue === undefined) {
          details.push({
            aspect: 'parameters',
            description: `destructured property '${name}' default value removed (was: ${bb.defaultValue})`,
            impact: SchemaChangeImpact.PATCH,
            from: String(bb.defaultValue),
          });
        } else if (bb.defaultValue === undefined && cb.defaultValue !== undefined) {
          details.push({
            aspect: 'parameters',
            description: `destructured property '${name}' default value added: ${cb.defaultValue}`,
            impact: SchemaChangeImpact.PATCH,
            to: String(cb.defaultValue),
          });
        } else {
          details.push({
            aspect: 'parameters',
            description: `destructured property '${name}' default value changed: ${bb.defaultValue} → ${cb.defaultValue}`,
            impact: SchemaChangeImpact.PATCH,
            from: String(bb.defaultValue),
            to: String(cb.defaultValue),
          });
        }
      }
      if (bb.type && cb.type && !typesAreSemanticallyEqual(bb.type, cb.type)) {
        details.push({
          aspect: 'parameters',
          description: `destructured property '${name}' type changed: ${typeStr(bb.type)} → ${typeStr(cb.type)}`,
          impact: paramTypeImpact(typeStr(bb.type), typeStr(cb.type)),
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
