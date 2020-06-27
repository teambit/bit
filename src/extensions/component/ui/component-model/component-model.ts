export type ComponentModelProps = {
  id: string;
};

export class ComponentModel {
  constructor(
    /**
     * id of the component
     */
    readonly id: string
  ) {}

  /**
   * create an instance of a component from a plain object.
   */
  static from({ id }: ComponentModelProps) {
    return new ComponentModel(id);
  }
}
