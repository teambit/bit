import React from 'react';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { CompareStatus, CompareStatusResolver, useComponentCompareContext } from '@teambit/component.ui.compare';
import { useFileContent } from '@teambit/code.ui.queries.get-file-content';

export function Widget({ node }: WidgetProps<any>) {
  const fileName = node.id;
  const componentCompareContext = useComponentCompareContext();
  const base = componentCompareContext?.base;
  const compare = componentCompareContext?.compare;
  /**
   * Note: This is temporary for the first release.
   * TBD move this to the Component Compare GQL API
   */
  const { fileContent: originalFileContent, loading: originalLoading } = useFileContent(base?.id, fileName);
  const { fileContent: modifiedFileContent, loading: modifiedLoading } = useFileContent(compare?.id, fileName);

  if (originalLoading || modifiedLoading) return null;

  let status: CompareStatus | undefined;
  if (!originalFileContent && modifiedFileContent) {
    status = 'new';
  } else if (!modifiedFileContent && originalFileContent) {
    status = 'deleted';
  } else if (modifiedFileContent !== originalFileContent) {
    status = 'modified';
  }

  if (!status) return null;

  return <CompareStatusResolver status={status as CompareStatus} />;
}
