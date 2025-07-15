import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TupleTypeSchema } from '@teambit/semantics.entities.semantic-schema';
import styles from './tuple-type.renderer.module.scss';

export const tupleTypeRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TupleTypeSchema.name,
  Component: TupleTypeArray,
  nodeType: 'TupleTypeArray',
  default: true,
};

function TupleTypeArray(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;

  const tupleTypeArray = api as TupleTypeSchema;

  return (
    <div className={styles.tupleArray}>
      <div className={styles.bracketGroup}>
        <div className={styles.bracket}>[</div>
        {tupleTypeArray.elements[0] && (
          <div className={styles.element}>
            <ElementRenderer element={tupleTypeArray.elements[0]} {...props} renderers={renderers} />
            {tupleTypeArray.elements.length > 1 && <div className={styles.comma}>,</div>}
          </div>
        )}
      </div>
      {tupleTypeArray.elements.slice(1, -1).map((element, index) => (
        <div key={index} className={styles.element}>
          <ElementRenderer element={element} {...props} renderers={renderers} />
          <div className={styles.comma}>,</div>
        </div>
      ))}
      {tupleTypeArray.elements.length > 1 && (
        <div className={styles.bracketGroup}>
          <div className={styles.element}>
            <ElementRenderer
              element={tupleTypeArray.elements[tupleTypeArray.elements.length - 1]}
              {...props}
              renderers={renderers}
            />
          </div>
          <div className={styles.bracket}>]</div>
        </div>
      )}
      {tupleTypeArray.elements.length <= 1 && <div className={styles.bracket}>]</div>}
    </div>
  );
}

function ElementRenderer({ element, renderers, ...props }) {
  const elementRenderer = renderers.find((renderer) => renderer.predicate(element));
  if (elementRenderer) {
    return (
      <elementRenderer.Component
        {...props}
        apiNode={{ ...props.apiNode, api: element, renderer: elementRenderer }}
        depth={(props.depth ?? 0) + 1}
        metadata={{ [element.__schema]: { columnView: true } }}
      />
    );
  }
  return element.toString();
}
