import { Composition, CompositionProps } from '../../../compositions/composition';

export type ComponentModelProps = {
  id: string;
  server: ComponentServer;
  displayName: string;
  compositions: CompositionProps[];
};

export type ComponentServer = {
  env: string;
  url: string;
};

export class ComponentModel {
  constructor(
    /**
     * id of the component
     */
    readonly id: string,

    /**
     * display name of the component.
     */
    readonly displayName: string,

    /**
     * the component server.
     */
    readonly server: ComponentServer,

    /**
     * array of compositions
     */
    readonly compositions: Composition[]
  ) {}

  /**
   * create an instance of a component from a plain object.
   */
  static from({ id, server, displayName, compositions }: ComponentModelProps) {
    return new ComponentModel(id, displayName, server, Composition.fromArray(compositions));
  }

  static empty() {
    return new ComponentModel('', '', { env: '', url: '' }, []);
  }
}
