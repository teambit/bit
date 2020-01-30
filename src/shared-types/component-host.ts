// import { BitId as ComponentId } from '../bit-id';
import { ComponentID } from '../extensions/component';
import { Component } from '../extensions/component';

/**
 * An interface for components hosts
 * This is used by the component-resolver to make sure he can get the components the same way from all hosts
 *
 * @interface ComponentHost
 */
export default interface ComponentHost {
  get: (id: string | ComponentID) => Promise<Component | undefined>;
}
