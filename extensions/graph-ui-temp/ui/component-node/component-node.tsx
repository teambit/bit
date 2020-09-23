import React from 'react';
import { ComponentModel } from '@teambit/component';
import styles from './component-node.module.scss';
// import { ComponentInGraph } from './data-short';

export function ComponentNode({ component }: { component: ComponentModel }) {
  return (
    <div className={styles.compNode}>
      {/* <div className={styles.breadcrumbs}>
        {component.id.legacyComponentId.scope}
      </div> */}
      <div>
        <span className={styles.name}>{component.id.toString()}</span>
        {/* <span className={styles.version}>
          {component.id.legacyComponentId.version}
        </span> */}
      </div>
      <div className={styles.buffs}>
        {/* <img src={component.environment?.icon} alt="env" /> */}
        {/* {component.deprecation?.isDeprecate && <span>!</span>} */}
        {/* {component.status.isNew && <span>N</span>} */}
      </div>
    </div>
  );
}
