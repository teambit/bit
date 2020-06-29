export type ComponentModelProps = {
  id: string;
  server: ComponentServer;
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
     * the component server.
     */
    readonly server: ComponentServer
  ) {}

  /**
   * create an instance of a component from a plain object.
   */
  static from({ id, server }: ComponentModelProps) {
    return new ComponentModel(id, server);
  }

  static empty() {
    return new ComponentModel('', { env: '', url: '' });
  }
}
