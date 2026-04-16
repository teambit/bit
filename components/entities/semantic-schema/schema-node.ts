import { pickBy } from 'lodash';
import pluralize from 'pluralize';
import type { DocSchema } from './schemas';
import type { SchemaChangeFact } from './schema-diff';
import { deepEqualNoLocation, diffDoc } from './schema-diff';

export interface ISchemaNode {
  __schema: string;
  name?: string;
  displaySchemaName: string;
  location: SchemaLocation;
  doc?: DocSchema;
  signature?: string;
  toObject(): Record<string, any>;
  toString(options?: { color?: boolean }): string;
  toFullSignature(options?: { showDocs?: boolean }): string;
  getNodes(): SchemaNode[];
  findNode(predicate: (node: SchemaNode) => boolean, visitedNodes?: Set<SchemaNode>): SchemaNode | undefined;
  getAllNodesRecursively(visitedNodes?: Set<SchemaNode>): SchemaNode[];
  diff(other: SchemaNode): SchemaChangeFact[];
}

/**
 * a convenient abstract class for all schema to extend.
 * the reason for having it as an abstract class and not an interface, for now, is mostly for the `__schema` prop.
 * this way it won't need to be implemented in each one of the subclasses.
 */
export abstract class SchemaNode implements ISchemaNode {
  readonly __schema = this.constructor.name;
  readonly displaySchemaName = pluralize(
    this.constructor.name
      .replace(/Schema$/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim()
  );

  abstract readonly location: SchemaLocation;
  readonly doc?: DocSchema;
  readonly signature?: string;
  readonly name?: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static fromObject(obj: Record<string, any>): SchemaNode {
    throw new Error(`Method 'fromObject' not implemented in subclass.`);
  }

  toObject(): Record<string, any> {
    return pickBy(
      {
        __schema: this.__schema,
        location: this.location,
        doc: this.doc ? this.doc.toObject() : undefined,
        signature: this.signature,
        name: this.name,
      },
      (v) => v !== undefined
    );
  }

  abstract toString(options?: { color?: boolean }): string;
  abstract toFullSignature(options?: { showDocs?: boolean }): string;

  getNodes(): SchemaNode[] {
    return [this];
  }

  getAllNodesRecursively(visitedNodes = new Set<SchemaNode>()): SchemaNode[] {
    if (visitedNodes.has(this)) {
      return [];
    }

    visitedNodes.add(this);

    const nodes = this.getNodes();
    return [this, ...nodes.flatMap((node) => node.getAllNodesRecursively(visitedNodes))];
  }

  findNode(predicate: (node: SchemaNode) => boolean, visitedNodes = new Set<SchemaNode>()): SchemaNode | undefined {
    if (predicate(this)) return this;
    if (visitedNodes.has(this)) return undefined;

    visitedNodes.add(this);

    for (const child of this.getNodes()) {
      const foundNode = child.findNode(predicate, visitedNodes);
      if (foundNode) return foundNode;
    }

    return undefined;
  }

  /**
   * Compute neutral change facts between this node and another node of the same type.
   * Subclasses should override with type-specific comparison logic.
   * Returns facts without impact judgment — impact is assessed separately.
   */
  diff(other: SchemaNode): SchemaChangeFact[] {
    const facts: SchemaChangeFact[] = [];
    const baseObj = this.toObject();
    const compareObj = other.toObject();

    // Doc changes
    facts.push(...diffDoc(baseObj.doc, compareObj.doc));

    // If only doc changed, we're done
    const baseNoDoc = { ...baseObj, doc: undefined, location: undefined };
    const compareNoDoc = { ...compareObj, doc: undefined, location: undefined };
    if (deepEqualNoLocation(baseNoDoc, compareNoDoc)) return facts;

    // Signature changed
    if (baseObj.signature !== compareObj.signature) {
      facts.push({
        changeKind: 'signature-changed',
        description: 'signature changed',
        context: { fromSignature: baseObj.signature, toSignature: compareObj.signature },
        from: baseObj.signature,
        to: compareObj.signature,
      });
    }

    return facts;
  }
}

export type SchemaLocation = {
  /**
   * file-path relative to the component root-dir. normalized to Linux.
   */
  filePath: string;
  line: number;
  character: number;
};
