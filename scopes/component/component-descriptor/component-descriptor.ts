import { ComponentID, IComponent } from '@teambit/component';
import { AspectListProps, AspectList } from './aspect-list';

export type ComponentDescriptorProps = {
  /**
   * serialized component ID.
   */
  id: string;
  /**
   * aspects map data
   */
  aspectList?: AspectListProps;
};

export class ComponentDescriptor implements IComponent {
  constructor(
    /**
     *  Component ID
     */
    readonly id: ComponentID,
    /**
     *  aspect map
     */
    readonly aspectList: AspectList
  ) {}

  get scope() {
    return this.id.scope;
  }

  get<T>(aspectId: string): T | undefined {
    return this.aspectList.get<T>(aspectId);
  }

  toObject(): ComponentDescriptorProps {
    return {
      id: this.id.toString(),
      aspectList: this.aspectList.toObject(),
    };
  }

  stringify() {
    return JSON.stringify(this.toObject());
  }

  toString() {
    return this.stringify();
  }

  static fromObject({ id, aspectList }: ComponentDescriptorProps) {
    const aspects = AspectList.fromObject(aspectList);
    return new ComponentDescriptor(ComponentID.fromString(id), aspects);
  }

  static fromArray(componentsDescriptorProps: ComponentDescriptorProps[]) {
    return componentsDescriptorProps.map((component) => ComponentDescriptor.fromObject(component));
  }
}
