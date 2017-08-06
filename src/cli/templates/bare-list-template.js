// @flow
import ConsumerComponent from '../../consumer/component/consumer-component';
import {VERSION_DELIMITER} from '../../constants';

export default (components: ConsumerComponent[]) => {
  function paintBareComponent(component) {
    return `${component.scope}/${component.box}/${component.name}${VERSION_DELIMITER}${component.version}`;
  }

  return components.map(paintBareComponent).join('\n');
};
