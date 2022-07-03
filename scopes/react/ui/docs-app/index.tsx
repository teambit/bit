import { RenderingContext } from '@teambit/preview';
import React from 'react';
import ReactDOM from 'react-dom';

import { Properties } from '@teambit/react.ui.properties';
import { CompositionsSummary } from '@teambit/react.ui.compositions-summary';
import { DocsContent } from '@teambit/react.ui.docs-content';

import { DocsApp } from './docs-app';
import { Base } from './base';
import type { DocsFile } from './examples-overview/example';
import styles from './base.module.scss';

export type ReactDocsRootParams = [
  /* Provider: */ React.ComponentType | undefined,
  /* componentId: */ string,
  /* docs: */ DocsFile | undefined,
  /* compositions: */ Record<string, any>,
  /* context: */ RenderingContext
];

export default function DocsRoot(
  Provider: React.ComponentType | undefined,
  componentId: string,
  docs: DocsFile | undefined,
  compositions: any,
  context: RenderingContext
) {
  ReactDOM.render(
    <DocsApp Provider={Provider}>
      <Base renderingContext={context}>
        <DocsContent docs={docs} className={styles.mdx}/>

        <CompositionsSummary
          compositions={compositions}
          className={styles.compositionSection}
          compositionCardClass={styles.compositionCard}
        />

        <Properties properties={componentId} />

      </Base>
    </DocsApp>
    ,
    document.getElementById('root')
  );
}

// hot reloading works when components are in a different file.
// do not declare react components here.
