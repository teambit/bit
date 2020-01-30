import { Edge } from 'cleargraph';

export type ExtensionEdgeData = { [type: string]: string };

export class ExtensionEdge implements Edge<string> {
  constructor(public sourceKey: string, public targetKey: string, public data: ExtensionEdgeData) {}
}
