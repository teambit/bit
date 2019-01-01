/// <reference types="node" />
export default class Console {
    private stdout;
    constructor(stdout?: NodeJS.WritableStream);
    getStdout(): NodeJS.WritableStream;
    on(): void;
}
