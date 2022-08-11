import { ComponentContext } from '@teambit/component';
import { H2 } from '@teambit/documenter.ui.heading';
import React, { useContext, useMemo, useState } from 'react';
import { FileIconMatch } from '@teambit/code.ui.utils.get-file-icon';
import { useComponentPipelineQuery } from '@teambit/component.ui.pipelines.component-pipeline-queries';
import { ArtifactPanel } from '@teambit/component.ui.pipelines.artifacts-panel';
import { ComponentPipelineContext } from '@teambit/component.ui.pipelines.component-pipeline-context';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import ReactFlow, {
  ArrowHeadType,
  Background,
  Controls,
  Edge,
  Node,
  ReactFlowProvider,
  NodeTypesType,
} from 'react-flow-renderer';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { calcDuration, calcMilliseconds, calcSeconds } from '@teambit/component.ui.pipelines.component-pipeline-utils';
import { PipelineNode } from './pipeline-node';
import { ComponentPipelineBlankState } from './blank-state';

import styles from './component-pipeline-page.module.scss';

export type ComponentPipelinePageProps = {
  host: string;
  fileIconMatchers: FileIconMatch[];
};

export function ComponentPipelinePage({ host, fileIconMatchers }: ComponentPipelinePageProps) {
  const component = useContext(ComponentContext);
  const { data } = useComponentPipelineQuery(host, component.id.toString());

  const nodes = useMemo(() => {
    if (!data) return [];

    const { tasks = [] } = data;
    return tasks.map((task, index) => {
      const duration = calcDuration(task.startTime, task.endTime);
      return {
        id: task.id,
        type: 'artifactNode',
        data: {
          ...task,
          duration,
        },
        position: { x: 50 + index * 300, y: 300 },
      } as Node;
    });
  }, [data]);

  const edges = useMemo(() => {
    if (!nodes || nodes.length < 2) {
      return [];
    }

    const _edges: Array<Edge> = [];

    for (let i = 1; i < nodes.length; i += 1) {
      const edge: Edge = {
        id: `${nodes[i - 1].id}_${nodes[i].id}`,
        source: nodes[i - 1].id,
        target: nodes[i].id,
        arrowHeadType: ArrowHeadType.Arrow,
      };
      _edges.push(edge);
    }
    return _edges;
  }, [nodes]);

  const elements = [...nodes, ...edges];

  const totalDurationSecs = useMemo(() => {
    if (!data) return 0;

    const { tasks } = data;
    return tasks.reduce((agg, cur) => {
      return agg + calcDuration(cur.startTime, cur.endTime);
    }, 0);
  }, [data]);

  const NodeTypes: NodeTypesType = {
    artifactNode: PipelineNode,
  };

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(undefined);
  const sidebarOpenness = selectedPipelineId ? Layout.row : Layout.left;
  const showBlankState = elements.length === 0;
  const onPanelClicked = () => {
    setSelectedPipelineId(undefined);
  };

  return (
    <ComponentPipelineContext.Provider
      value={{
        pipeline: data?.tasks || [],
        selectedPipelineId,
        setSelectedPipelineId,
      }}
    >
      <ReactFlowProvider>
        <div className={styles.page}>
          <H2 size="xs">Pipeline</H2>
          {!showBlankState && (
            <div className={styles.statContainer}>
              <div className={styles.statItem}>
                <p className={styles.statTitle}>Duration</p>
                <p>
                  {calcSeconds(totalDurationSecs)}s {calcMilliseconds(totalDurationSecs)}ms
                </p>
              </div>
              <div className={styles.statItem}>
                <p className={styles.statTitle}>Status</p>
                <p>{data?.buildStatus}</p>
              </div>
            </div>
          )}
          <SplitPane size={'75%'} className={styles.graphContainer} layout={sidebarOpenness}>
            <Pane>
              {!showBlankState && (
                <ReactFlow
                  draggable={false}
                  nodesDraggable={false}
                  selectNodesOnDrag={false}
                  nodesConnectable={false}
                  zoomOnDoubleClick={false}
                  elementsSelectable={true}
                  maxZoom={1}
                  nodeTypes={NodeTypes}
                  elements={elements}
                  className={styles.graph}
                  onPaneClick={onPanelClicked}
                >
                  <Background />
                  <Controls className={styles.controls} />
                </ReactFlow>
              )}
              {showBlankState && <ComponentPipelineBlankState />}
            </Pane>
            {(selectedPipelineId && <HoverSplitter></HoverSplitter>) || <></>}
            {(selectedPipelineId && (
              <Pane>
                <ArtifactPanel fileIconMatchers={fileIconMatchers} />
              </Pane>
            )) || <></>}
          </SplitPane>
        </div>
      </ReactFlowProvider>
    </ComponentPipelineContext.Provider>
  );
}
