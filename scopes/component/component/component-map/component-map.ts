import { ComponentID } from '@teambit/component-id';
import { Component } from '../component';

/**
 * allows to index components -> values.
 */
export class ComponentMap<T> {
  constructor(readonly hashMap: Map<string, [Component, T]>) {}

  /**
   * @deprecated please use `get` instead
   */
  byComponent(component: Component) {
    return this.hashMap.get(component.id.toString());
  }

  get components() {
    return this.toArray().map(([component]) => component);
  }

  /**
   * get a value for a component.
   */
  get(component: Component) {
    return this.hashMap.get(component.id.toString());
  }

  /**
   * get a value by the component-id
   */
  getValueByComponentId(componentId: ComponentID): T | null {
    const tuple = this.hashMap.get(componentId.toString());
    if (!tuple) return null;
    return tuple[1];
  }

  /**
   * returns an array.
   */
  toArray() {
    return Array.from(this.hashMap.values());
  }

  /**
   * map entries and return a new component map.
   */
  map<NewType>(predicate: (value: T, component: Component) => NewType): ComponentMap<NewType> {
    const tuples: [string, [Component, NewType]][] = this.toArray().map(([component, value]) => {
      const newValue = predicate(value, component);
      return [component.id.toString(), [component, newValue]];
    });

    return new ComponentMap(new Map(tuples));
  }
  /**
   * flatten values of all components into a single array.
   */
  flattenValue(): T[] {
    return this.toArray().reduce((acc: T[], [, value]) => {
      acc = acc.concat(value);
      return acc;
    }, []);
  }

  /**
   * filter all components with empty values and return a new map.
   */
  filter(predicate: (value: T) => boolean): ComponentMap<T> {
    const tuples = this.toArray().filter(([, value]) => {
      return predicate(value);
    });

    const asMap: [string, [Component, T]][] = tuples.map(([component, value]) => {
      return [component.id.toString(), [component, value]];
    });

    return new ComponentMap(new Map(asMap));
  }

  /**
   * get all component ids.
   */
  keys() {
    return this.hashMap.keys();
  }

  static create<U>(rawMap: [Component, U][]) {
    const newMap: [string, [Component, U]][] = rawMap.map(([component, data]) => {
      return [component.id.toString(), [component, data]];
    });
    return new ComponentMap(new Map(newMap));
  }

  /**
   * create a component map from components and a value predicate.
   * @param components components to zip into the map.
   * @param predicate predicate for returning desired value.
   */
  static as<U>(components: Component[], predicate: (component: Component) => U): ComponentMap<U> {
    const tuples: [string, [Component, U]][] = components.map((component) => {
      return [component.id.toString(), [component, predicate(component)]];
    });

    return new ComponentMap(new Map(tuples));
  }
}
