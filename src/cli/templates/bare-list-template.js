// @flow
import { VERSION_DELIMITER } from '../../constants';
import type { ListScopeResult } from '../../consumer/component/components-list';

export default (listScopeResults: ListScopeResult[]) => {
  function paintBareComponent(listScopeResult: ListScopeResult) {
    // $FlowFixMe scope and version properties are always set for scope components
    return `${listScopeResult.id.scope}/${listScopeResult.id.name}${VERSION_DELIMITER}${listScopeResult.id.version}`;
  }

  return listScopeResults.map(paintBareComponent).join('\n');
};
