import { ComponentContext } from '@teambit/component';
import { H2 } from '@teambit/documenter.ui.heading';
import React, { useContext, useMemo, useState } from 'react';
import {
  useComponentPipelineQuery,
  PipelineNode,
  ComponentPipelineContext,
  ArtifactPanel,
  ComponentPipelineBlankState,
} from '@teambit/component.ui.component-pipeline';
import ReactFlow, {
  ArrowHeadType,
  Background,
  Controls,
  Edge,
  Node,
  NodeTypesType,
  ReactFlowProvider,
} from 'react-flow-renderer';
import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';

import styles from './component-pipeline-page.module.scss';

export type ComponentPipelinePageProps = {
  host: string;
};

export function ComponentPipelinePage({ host }: ComponentPipelinePageProps) {
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
          durationSecs: calcSeconds(duration),
          durationMilliSecs: calcMilliseconds(duration),
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

  return (
    <div className={styles.page}>
      <ComponentPipelineContext.Provider
        value={{
          pipeline: data?.tasks || [],
          selectedPipelineId,
          setSelectedPipelineId,
        }}
      >
        <H2 size="xs">Pipeline</H2>
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
        <SplitPane size={'75%'} className={styles.graphContainer} layout={sidebarOpenness}>
          <Pane>
            <ReactFlowProvider>
              {!showBlankState && (
                <ReactFlow
                  draggable={false}
                  nodesDraggable={true}
                  selectNodesOnDrag={false}
                  nodesConnectable={false}
                  zoomOnDoubleClick={false}
                  elementsSelectable={false}
                  maxZoom={1}
                  elements={elements}
                  nodeTypes={NodeTypes}
                  className={styles.graph}
                >
                  <Background />
                  <Controls className={styles.controls} />
                </ReactFlow>
              )}
              {showBlankState && <ComponentPipelineBlankState />}
            </ReactFlowProvider>
          </Pane>
          {(selectedPipelineId && <HoverSplitter></HoverSplitter>) || <></>}
          {(selectedPipelineId && (
            <Pane>
              <ArtifactPanel />
            </Pane>
          )) || <></>}
        </SplitPane>
      </ComponentPipelineContext.Provider>
    </div>
  );
}

function calcDuration(startTime?: number, endTime?: number): number {
  return (endTime || 0) - (startTime || 0);
}

function calcSeconds(duration: number): number {
  return Math.floor(duration / 1000);
}

function calcMilliseconds(duration: number): number {
  return duration % 1000;
}
