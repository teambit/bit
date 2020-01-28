import { Node } from 'cleargraph';
import { AnyExtension } from '../types';

export class ExtensionNode implements Node<AnyExtension> {
  constructor(public key: string, public data: AnyExtension) {}
}
