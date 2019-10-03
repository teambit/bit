import { VERSION_DELIMITER } from '../../constants';
import { ListScopeResult } from '../../consumer/component/components-list';

export default (rawScopeResults: ListScopeResult[]) => {
  function paintRawComponent(listScopeResult: ListScopeResult) {
    // $FlowFixMe scope and version properties are always set for scope components
    return `${listScopeResult.id.scope}/${listScopeResult.id.name}${VERSION_DELIMITER}${listScopeResult.id.version}`;
  }

  return rawScopeResults.map(paintRawComponent).join('\n');
};
