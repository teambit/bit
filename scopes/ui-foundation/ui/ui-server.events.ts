export interface UIServerStatusData {
    running: boolean;
    port: number;
    host: string;
    startTime: number;
    pid: number;
    event: UIEvent;
}

export const UI_SERVER_STATUS_EVENT = 'onUIServerStatus';
export type UIEvent = typeof UI_SERVER_STATUS_EVENT;