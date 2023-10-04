import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { sortAPINodes } from '@teambit/api-reference.utils.sort-api-nodes';
import { compact, flatten } from 'lodash';

import styles from './api-reference-explorer.module.scss';

export type APIReferenceTableOfContentsProps = {
  apiModel: APIReferenceModel;
  getIcon?: (apiType: string) => string | undefined;
} & HTMLAttributes<HTMLDivElement>;

export function APIReferenceTableOfContents({ apiModel, className, getIcon }: APIReferenceTableOfContentsProps) {
  const apiToc = compact(
    flatten(Array.from(apiModel.apiByType.values()))
      .sort(sortAPINodes)
      .map((apiNode) => {
        return apiNode.api.name;
      })
  );

  return <div className={classNames(styles.apiReferenceExplorer, className)}></div>;
}
