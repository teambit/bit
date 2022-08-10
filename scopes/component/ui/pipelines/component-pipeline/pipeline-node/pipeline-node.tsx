import React from 'react';
import { Card } from '@teambit/base-ui.surfaces.card';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useComponentPipelineContext } from '@teambit/component.ui.pipelines.component-pipeline-context';
import { TaskReport } from '@teambit/component.ui.pipelines.component-pipeline-model/component-pipeline.model';
import { Handle, NodeProps, Position } from 'react-flow-renderer';
import styles from './pipeline-node.module.scss';

export type PipelineNodeProps = NodeProps<TaskReport & { durationSecs: number; durationMilliSecs: number }>;

export function PipelineNode(props: PipelineNodeProps) {
  const {
    id,
    isConnectable,
    data: { id: taskId, name: taskName, durationSecs, durationMilliSecs, warnings, errors, artifact },
  } = props;
  const icon = 'https://static.bit.dev/extensions-icons/react.svg';
  const componentPipelineContext = useComponentPipelineContext();
  const isSelected = componentPipelineContext?.selectedPipelineId === id;
  const onPipelineNodeClicked = () => {
    const updatedId = isSelected ? undefined : id;
    componentPipelineContext?.setSelectedPipelineId(updatedId);
  };
  const showErrorStatus = errors.length > 0;
  const showWarningStaus = !showErrorStatus && warnings.length > 0;
  const Pipeline = (
    <div key={`artifact-node-${id}`}>
      <Handle type="target" position={Position.Left} style={{ background: '#555' }} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} style={{ background: '#555' }} isConnectable={isConnectable} />
      <Card
        className={classNames(
          styles.compNode,
          isSelected && styles.selected,
          showWarningStaus && styles.warning,
          showErrorStatus && styles.error
        )}
        roundness="small"
        elevation="none"
        onClick={artifact && onPipelineNodeClicked}
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
  if (!artifact)
    return (
      <Tooltip placement="bottom" content={'no artifacts'}>
        {Pipeline}
      </Tooltip>
    );
  return Pipeline;
}

export default PipelineNode;
