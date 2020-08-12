import { Component } from '../component';

/**
 * allows to index components -> values.
 */
export class ComponentMap<T> extends Map<string, [Component, T]> {
  byComponent(component: Component) {
    return super.get(component.id.fullName);
  }

  /**
   * returns an array.
   */
  toArray() {
    return Array.from(this.values());
  }

  /**
   * map entries and return a new component map.
   */
  map<NewType>(predicate: (value: T) => NewType): ComponentMap<NewType> {
    const tuples: [string, [Component, NewType]][] = this.toArray().map(([component, value]) => {
      const newValue = predicate(value);
      return [component.id.fullName, [component, newValue]];
    });

    return new ComponentMap(tuples);
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
      return [component.id.fullName, [component, value]];
    });

    return new ComponentMap(asMap);
  }

  /**
   * create a component map from components and a value predicate.
   * @param components components to zip into the map.
   * @param predicate predicate for returning desired value.
   */
  static as<T>(components: Component[], predicate: (component: Component) => T): ComponentMap<T> {
    const tuples: [string, [Component, T]][] = components.map((component) => {
      return [component.id.fullName, [component, predicate(component)]];
    });

    return new ComponentMap(tuples);
  }
}
