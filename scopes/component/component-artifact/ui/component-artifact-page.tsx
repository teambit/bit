import React from "react";
import {useArtifacts} from "./hooks/use-artifacts";

export type ComponentArtifactPageProps = {
    host: string,
    componentId: string,
}

export function ComponentArtifactPage({ host, componentId }: ComponentArtifactPageProps) {
    const {data, loading} = useArtifacts(host, componentId);
    console.log({ data, loading })

    return <div>Hello Component Artifact World!</div>
}
