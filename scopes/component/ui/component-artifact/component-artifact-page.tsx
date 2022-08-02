import { ComponentContext } from '@teambit/component';
import { H2 } from '@teambit/documenter.ui.heading';
import React, { useContext, useMemo, useState } from 'react';
import {
  useBuildArtifactsQuery,
  ArtifactNode,
  ComponentArtifactContext,
} from '@teambit/component.ui.component-artifact';
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

import styles from './component-artifact-page.module.scss';

export type ComponentArtifactPageProps = {
  host: string;
};

export function ComponentArtifactPage({ host }: ComponentArtifactPageProps) {
  const component = useContext(ComponentContext);
  const { data } = useBuildArtifactsQuery(host, component.id.toString());

  const nodes = useMemo(() => {
    if (!data) return [];

    const { pipelines = [] } = data;
    return pipelines.map((pipeline, index) => {
      const duration = calcDuration(pipeline.startTime, pipeline.endTime);
      return {
        id: pipeline.id,
        type: 'artifactNode',
        data: {
          taskId: pipeline.taskId,
          taskName: pipeline.taskName,
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

    const { pipelines } = data;
    return pipelines.reduce((agg, cur) => {
      return agg + calcDuration(cur.startTime, cur.endTime);
    }, 0);
  }, [data]);

  const NodeTypes: NodeTypesType = {
    artifactNode: ArtifactNode,
  };

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>(undefined);
  const sidebarOpenness = selectedPipelineId ? Layout.row : Layout.left;

  return (
    <ComponentArtifactContext.Provider
      value={{
        buildArtifacts: data,
        artifactPanelState: {
          selectedPipelineId,
          setSelectedPipelineId,
        },
      }}
    >
      <H2 size="xs">Component Artifacts</H2>
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
      <SplitPane className={styles.page} layout={sidebarOpenness}>
        <Pane size={selectedPipelineId ? '65%' : '100%'}>
          <ReactFlowProvider>
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
          </ReactFlowProvider>
        </Pane>
        {(selectedPipelineId && <HoverSplitter></HoverSplitter>) || <></>}
        {(selectedPipelineId && <Pane size={selectedPipelineId ? '35%' : '0%'}>{'ARTIFACT DATA'}</Pane>) || <></>}
      </SplitPane>
    </ComponentArtifactContext.Provider>
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
