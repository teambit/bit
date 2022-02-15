import { ComponentID } from '@teambit/component';
import { AspectMapProps, AspectMap } from './aspect-map';

export type ComponentDescriptorProps = {
  /**
   * serialized component ID.
   */
  id: {
    name: string;
    scope: string;
    version?: string;
  };
  /**
   * aspects map data
   */
  aspectMap?: AspectMapProps;
};

export class ComponentDescriptor {
  constructor(
    /**
     *  Component ID
     */
    readonly id: ComponentID,
    /**
     *  aspect map
     */
    readonly aspectMap: AspectMap
  ) {}

  get state() {
    return this.aspectMap;
  }

  get scope() {
    return this.id.scope;
  }

  get<T>(aspectId: string): T | undefined {
    return this.aspectMap.get<T>(aspectId);
  }

  toObject(): ComponentDescriptorProps {
    return {
      id: this.id.toObject(),
      aspectMap: this.aspectMap.toObject(),
    };
  }

  stringify() {
    return JSON.stringify(this.toObject());
  }

  toString() {
    return this.stringify();
  }

  static fromObject({ id, aspectMap }: ComponentDescriptorProps) {
    const aspects = AspectMap.fromObject(aspectMap);
    return new ComponentDescriptor(ComponentID.fromObject(id), aspects);
  }

  static fromArray(componentsDescriptorProps: ComponentDescriptorProps[]) {
    return componentsDescriptorProps.map((component) => ComponentDescriptor.fromObject(component));
  }
}
