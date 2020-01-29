import { Edge } from 'cleargraph';

export class ExtensionEdge implements Edge<string> {
  constructor(public sourceKey: string, public targetKey: string, public data: string) {}
}
