export type VertexId = string;

export class Vertex<VD> {
  constructor(readonly id: VertexId, readonly attr: VD) {}

  static fromObject<VD>(object: { id: VertexId; attr: VD }) {
    return new Vertex(object.id, object.attr);
  }
}
