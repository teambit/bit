import { Card } from '@teambit/base-ui.surfaces.card';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import classNames from 'classnames';
import React from "react";
import { Handle, NodeProps, Position } from 'react-flow-renderer';
import styles from "./artifact-node.module.scss";

export type ArtfactNodeProps = NodeProps & {

}

function ArtifactNode(props: ArtfactNodeProps) {
    const { isConnectable, data } = props;
    const icon = "https://static.bit.dev/extensions-icons/react.svg";

    return (
        <>
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
            <Card
                className={classNames(
                    styles.compNode,
                    // variants.root
                )}
                roundness="small"
                elevation="none"
            >
                <div style={{ display: "flex" }}>
                    <div className={classNames(styles.componentDetails)}>
                        {/* <div className={classNames(styles.status)}>{statusToDisplay}</div> */}
                        {<img src={icon} className={styles.envIcon} />}
                    </div>
                    <div style={{ marginLeft: 5 }}>
                        <div className={classNames(styles.breadcrumbs, ellipsis)}>bit/agaga/awta</div>
                    </div>
                </div>
                <div className={classNames(styles.componentName)} style={{justifyContent: "space-between"}}>
                    <div className={classNames(styles.name, ellipsis)}>
                        {data.label}
                    </div>
                    <div className={classNames(styles.version, ellipsis)}> 4m 7s</div>
                </div>
            </Card>
        </>
    );
}

export default ArtifactNode;