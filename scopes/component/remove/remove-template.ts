import type { ComponentIdList } from '@teambit/component-id';
import { ComponentID } from '@teambit/component-id';
import { isEmpty } from 'lodash';
import { formatTitle, formatItem, formatSuccessSummary, errorSymbol, joinSections } from '@teambit/cli';

export function removeTemplate(
  { dependentBits, modifiedComponents = [], removedComponentIds, missingComponents, removedFromLane },
  isRemote
) {
  const paintMissingComponents = () => {
    if (isEmpty(missingComponents)) return '';
    const items = missingComponents.map((id) => {
      if (!(id instanceof ComponentID)) id = ComponentID.fromObject(id);
      return formatItem(id.version === 'latest' ? id.toStringWithoutVersion() : id.toString(), errorSymbol);
    });
    return `${errorSymbol} ${formatTitle('missing components')}\n${items.join('\n')}`;
  };
  const paintRemoved = () => {
    if (isEmpty(removedComponentIds) && isEmpty(removedFromLane)) return '';
    const compToItems = (comps: ComponentIdList) =>
      comps.map((id) => formatItem(id.version === 'latest' ? id.toStringWithoutVersion() : id.toString()));
    const getMsg = (isLane = false) => {
      const removedFrom = isLane ? 'lane' : 'scope';
      return isRemote
        ? `successfully removed components from the remote ${removedFrom}`
        : `successfully removed components from the local ${removedFrom}`;
    };
    const compOutput = isEmpty(removedComponentIds)
      ? ''
      : `${formatSuccessSummary(getMsg(false))}\n${compToItems(removedComponentIds).join('\n')}`;
    const laneOutput = isEmpty(removedFromLane)
      ? ''
      : `${formatSuccessSummary(getMsg(true))}\n${compToItems(removedFromLane).join('\n')}`;

    return joinSections([compOutput, laneOutput]);
  };

  const paintUnRemovedComponents = () => {
    if (isEmpty(dependentBits)) return '';
    return Object.keys(dependentBits)
      .map((key) => {
        const header = `${errorSymbol} ${formatTitle(`unable to delete ${key}, because the following components depend on it`)}`;
        const body = dependentBits[key].map((dep) => formatItem(dep, errorSymbol)).join('\n');
        return `${header}\n${body}`;
      })
      .join('\n\n');
  };

  const paintModifiedComponents = () => {
    if (isEmpty(modifiedComponents)) return '';
    const items = modifiedComponents.map((id: ComponentID) =>
      formatItem(id.version === 'latest' ? id.toStringWithoutVersion() : id.toString(), errorSymbol)
    );
    return `${errorSymbol} ${formatTitle('unable to remove modified components (use --force to remove)')}\n${items.join('\n')}`;
  };

  return joinSections([
    paintUnRemovedComponents(),
    paintRemoved(),
    paintMissingComponents(),
    paintModifiedComponents(),
  ]);
}
