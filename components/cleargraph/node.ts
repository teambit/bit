import { isEqual } from 'lodash';
import _ from 'lodash';

export class Node<N> {
  id: string;
  attr: N;
  _inEdges: string[];
  _outEdges: string[];
  constructor(id: string, attr: N, inEdges?: string[], outEdges?: string[]) {
    this.id = id;
    this.attr = attr;
    this._inEdges = inEdges || [];
    this._outEdges = outEdges || [];
  }

  setInEdge(edgeId: string) {
    this._inEdges.push(edgeId);
  }

  setOutEdge(edgeId: string) {
    this._outEdges.push(edgeId);
  }

  deleteEdge(edgeId: string) {
    _.remove(this._inEdges, function (edge) {
      return edge === edgeId;
    });
    _.remove(this._outEdges, function (edge) {
      return edge === edgeId;
    });
  }

  get inEdges(): string[] {
    return this._inEdges;
  }

  get outEdges(): string[] {
    return this._outEdges;
  }

  get nodeEdges(): string[] {
    return this._inEdges.concat(this._outEdges);
  }

  /**
   * return true if node doesn't have any out edges
   */
  hasNoSuccessors(): boolean {
    return this._outEdges.length === 0;
  }

  /**
   * return true if node doesn't have any in edges
   */
  hasNoPredecessors(): boolean {
    return this._inEdges.length === 0;
  }

  /**
   * return true if node has only out edges
   */
  isSource(): boolean {
    return this._inEdges.length === 0 && this._outEdges.length > 0;
  }

  /**
   * return true if node has only in edges
   */
  isSink(): boolean {
    return this._inEdges.length > 0 && this._outEdges.length === 0;
  }

  equals(node: Node<N>) {
    if (this.id !== node.id) return false;
    return isEqual(this.attr, node.attr);
  }

  stringify() {
    let attrStr: string = '';
    //@ts-ignore
    if (!!this.attr['stringify'] && typeof this.attr['stringify'] === 'function') {
      //@ts-ignore
      attrStr = this.attr.stringify();
    } else {
      attrStr = JSON.stringify(this.attr);
    }
    return attrStr;
  }

  static fromObject(obj: { id: string; attr: string }, parseNode: (data: any) => any) {
    if (!obj.hasOwnProperty('id')) {
      throw Error('missing object id');
    }
    return new Node(obj.id, parseNode(obj.attr));
  }
}

export function genericParseNode(nodeAttr: string) {
  if (typeof nodeAttr !== 'string') {
    return nodeAttr;
  }
  const parsed = JSON.parse(nodeAttr);
  return parsed;
}

export function genericNodeToJson(node: any) {
  return node;
}
