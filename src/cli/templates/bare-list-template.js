// @flow
import ConsumerComponent from '../../consumer/component/consumer-component';

export default (components: ConsumerComponent[]) => {
  function paintBareComponent(component) {
    // $FlowFixMe
    return `${component.scope}/${component.box}/${component.name}::${component.version}`;
  }

  return components.map(paintBareComponent).join('\n');
};
