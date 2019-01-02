/// <reference types="node" />
import { Container, ExecOptions, Exec, ContainerStatus } from '@bit/bit.capsule-dev.core.capsule';
export default class FsContainer implements Container {
    id: string;
    path: string;
    constructor(path?: string);
    getPath(): string;
    private generateDefaultTmpDir;
    exec(execOptions: ExecOptions): Promise<Exec>;
    get(options: {
        path: string;
    }): Promise<NodeJS.ReadableStream>;
    put(files: {
        [path: string]: string;
    }, options: {
        overwrite?: boolean | undefined;
        path: string;
    }): Promise<void>;
    start(): Promise<void>;
    inspect(): Promise<ContainerStatus>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    stop(ttl?: number | undefined): Promise<void>;
    destroy(): Promise<void>;
}
