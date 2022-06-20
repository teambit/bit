import { ComponentID } from '@teambit/component-id';

export interface IComponent {
  /**
   * id of the component.
   */
  id: ComponentID;

  /**
   * get function to retrieve aspect
   */
  get(id: string): RawComponentMetadata | undefined;

  /**
   * determines whether a component is a modified state.
   */
  isModified(): Promise<boolean>;
}

export type RawComponentMetadata = {
  id: string;
  config: Record<string, any>,
  data: Record<string, any>,
  icon?: string
};
