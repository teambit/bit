import React from "react";
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import ReactFlow, {
    NodeProps,
    Background, Controls, Edge, Node, NodeTypesType, ReactFlowProvider, Handle, Position
} from 'react-flow-renderer';
import classNames from 'classnames';
import { buildStepPalette } from '@teambit/base-ui.theme.accent-color';

import styles from "./artifact-node.module.scss";
import variants from "./variants.module.scss";

export type ArtfactNodeProps = NodeProps & {

}

function ArtifactNode(props: ArtfactNodeProps) {
    const { isConnectable, data } = props;

    return (
        <Card
            className={classNames(
                styles.compNode,
                variants.root
            )}
            roundness="small"
            elevation="none"
        >
            <div>
                <Handle
                    type="target"
                    position={Position.Left}
                    style={{ background: '#555' }}
                    onConnect={(params) => console.log('handle onConnect', params)}
                    isConnectable={isConnectable}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    style={{ background: '#555' }}
                    onConnect={(params) => console.log('handle onConnect', params)}
                    isConnectable={isConnectable}
                />
                {data.label}
            </div>
        </Card>
    );
}

export default ArtifactNode;