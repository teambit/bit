import React, { useContext } from 'react';
import { UIRuntime } from '@teambit/ui';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import type { ComponentModel } from '@teambit/component';
import type { DocsUI } from '@teambit/docs';
import { DocsAspect } from '@teambit/docs';
import { ComponentSize } from '@teambit/component.ui.component-size';
import { WorkspaceContext } from '@teambit/workspace';
import { PillLabel } from '@teambit/design.ui.pill-label';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentSizerAspect } from './component-sizer.aspect';

import styles from './component-sizer.module.scss';

/**
 * Component size aspect.
 */
export class SizerUIRuntime {
  static dependencies = [DocsAspect];

  static runtime = UIRuntime;

  static async provider([docs]: [DocsUI]) {
    docs.registerTitleBadge({
      component: function badge({ legacyComponentModel }: { legacyComponentModel: ComponentModel }) {
        const workspace = useContext(WorkspaceContext);
        const query = useQuery();
        const workspaceComponent = workspace?.components.find((component) =>
          component.id.isEqual(legacyComponentModel.id)
        );
        const componentVersionFromUrl = query.get('version');
        const isWorkspaceVersion = Boolean(workspaceComponent && !componentVersionFromUrl);
        const size = legacyComponentModel.size;
        const isModified = Boolean(
          workspaceComponent?.status?.modifyInfo?.hasModifiedFiles ||
            workspaceComponent?.status?.modifyInfo?.hasModifiedDependencies
        );
        const sizeExistsBuComponentModified = Boolean(size && isModified);

        if (isWorkspaceVersion && sizeExistsBuComponentModified) {
          return (
            <Tooltip
              className={styles.componentSizeTooltip}
              placement="top"
              content={
                <div className={styles.componentSizeTooltipContent}>
                  Component is modified. Size is calculated upon build
                </div>
              }
            >
              <div>
                <PillLabel className={styles.label}>
                  <img
                    style={{ width: '16px', marginRight: '4px' }}
                    src="https://static.bit.dev/bit-icons/weight.svg"
                  />
                </PillLabel>
              </div>
            </Tooltip>
          );
        }

        return <ComponentSize legacyComponentModel={legacyComponentModel} />;
      },
      weight: 30,
    });
  }
}

ComponentSizerAspect.addRuntime(SizerUIRuntime);
