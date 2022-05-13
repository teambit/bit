import { ComponentContext } from '@teambit/component';
import { H2 } from '@teambit/documenter.ui.heading';
import React, { useContext, useMemo } from 'react';
import ReactFlow, { ArrowHeadType, Background, Controls, Edge, Node, NodeTypesType, ReactFlowProvider } from 'react-flow-renderer';
import ArtifactNode from './artifact-node';
import styles from './component-artifact-page.module.scss';
import { useArtifacts } from "./hooks/use-artifacts";

export type ComponentArtifactPageProps = {
    host: string,
}

export function ComponentArtifactPage({ host }: ComponentArtifactPageProps) {
    const component = useContext(ComponentContext);
    const { data, loading } = useArtifacts(host, component.id.toString());

    const nodes = useMemo(() => {
        if (!data) return [];

        const { pipleline = [] } = data;
        return pipleline.map((task, index) => ({
            id: index.toString(),
            type: "artifactNode",
            data: { label: task.taskName },
            position: { x: 100 + index * 300, y: 100 }
        } as Node));
    }, [data]);

    const edges = useMemo(() => {
        if (!nodes || nodes.length < 2) {
            return [];
        }

        let edges: Array<Edge> = [];
        for (let i = 1; i < nodes.length; i++) {
            const edge: Edge = {
                id: `${nodes[i - 1].id}_${nodes[i].id}`,
                source: nodes[i - 1].id,
                target: nodes[i].id,
                arrowHeadType: ArrowHeadType.Arrow
            }
            edges.push(edge);
        }
        return edges;
    }, [nodes]);

    const elements = [
        ...nodes,
        ...edges
    ];

    const NodeTypes: NodeTypesType = {
        artifactNode: ArtifactNode,
    };


    return <div className={styles.page}>
        <H2 size="xs">Component Artifacts</H2>

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
            >
                <Background />
                <Controls className={styles.controls} />
            </ReactFlow>
        </ReactFlowProvider>
    </div>
}