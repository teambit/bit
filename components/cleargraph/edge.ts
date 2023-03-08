import _ from 'lodash';

/**
 * A single directed edge consisting of a source id, target id,
 * and the data associated with the edge.
 *
 * @tparam E type of the edge attribute
 *
 * @param sourceId The vertex id of the source vertex
 * @param targetId The vertex id of the target vertex
 * @param attr The attributes associated with the edge
 */
export class Edge<E> {
  attr: E;
  constructor(readonly sourceId: string, readonly targetId: string, attr: E, public bidirectional: boolean = false) {
    this.sourceId = sourceId;
    this.targetId = targetId;
    this.attr = attr;
    this.bidirectional = bidirectional;
  }

  get id() {
    return Edge.edgeId(this.sourceId, this.targetId);
  }

  get source() {
    return this.sourceId;
  }

  get target() {
    return this.targetId;
  }

  setBidirectional(status: boolean) {
    this.bidirectional = status;
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

  // {"sourceId": "a", "targetId": "b", "attr": {"lifecycle": "peer"}}
  static fromObject(
    obj: { sourceId: string; targetId: string; attr: any; bidirectional?: boolean },
    parseEdge: (data: any) => any
  ) {
    if (!obj.hasOwnProperty('sourceId')) {
      throw Error('missing source id');
    }
    if (!obj.hasOwnProperty('targetId')) {
      throw Error('missing target id');
    }
    return new Edge(obj.sourceId, obj.targetId, parseEdge(obj.attr), obj.bidirectional);
  }

  static edgeId(sourceId: string, targetId: string): string {
    return `${sourceId}->${targetId}`;
  }

  static parseEdgeId(id: string): { sourceId: string; targetId: string } {
    const spl = id.split('->');
    if (spl.length === 2) {
      return { sourceId: spl[0], targetId: spl[1] };
    }
    return { sourceId: '', targetId: '' };
  }

  get nodes() {
    return [this.sourceId, this.targetId];
  }
}

export function genericParseEdge(edgeAttr: string) {
  if (typeof edgeAttr !== 'string') {
    return edgeAttr;
  }
  const parsed = JSON.parse(edgeAttr);
  return parsed;
}

export function genericEdgeToJson(edge: any) {
  return edge;
}
