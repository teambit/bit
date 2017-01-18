/** @flow */
import Component from '../consumer-component';

export default (component: Component) => {
  component.impl.validate();
};
