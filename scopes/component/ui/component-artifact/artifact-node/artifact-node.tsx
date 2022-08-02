import { Card } from '@teambit/base-ui.surfaces.card';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import React from 'react';
import { useComponentArtifactContext } from '@teambit/component.ui.component-artifact';
import { Handle, NodeProps, Position } from 'react-flow-renderer';
import styles from './artifact-node.module.scss';

export type ArtfactNodeProps = NodeProps & {};

export function ArtifactNode(props: ArtfactNodeProps) {
  const {
    id,
    isConnectable,
    data: { taskName, taskId, durationSecs, durationMilliSecs },
  } = props;
  const icon = 'https://static.bit.dev/extensions-icons/react.svg';
  const componentArtifactContext = useComponentArtifactContext();
  const onArtifactNodeClicked = () => {
    const updatedId = componentArtifactContext?.artifactPanelState.selectedPipelineId === id ? undefined : id;
    componentArtifactContext?.artifactPanelState.setSelectedPipelineId(updatedId);
  };

  return (
    <div key={`artifact-node-${id}`}>
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} isConnectable={isConnectable} />
      <Card
        className={classNames(
          styles.compNode
          // variants.root
        )}
        roundness="small"
        elevation="none"
        onClick={onArtifactNodeClicked}
      >
        <div style={{ display: 'flex' }}>
          <div className={classNames(styles.componentDetails)}>
            {/* <div className={classNames(styles.status)}>{statusToDisplay}</div> */}
            {<img src={icon} className={styles.envIcon} />}
          </div>
          <div style={{ marginLeft: 5 }}>
            <div className={classNames(styles.breadcrumbs, ellipsis)}>{taskId}</div>
          </div>
        </div>
        <div className={classNames(styles.componentName)} style={{ justifyContent: 'space-between' }}>
          <div className={classNames(styles.name, ellipsis)}>{taskName}</div>
          <div className={classNames(styles.version, ellipsis)}>
            {durationSecs}s {durationMilliSecs}ms
          </div>
        </div>
      </Card>
    </div>
  );
}

export default ArtifactNode;
