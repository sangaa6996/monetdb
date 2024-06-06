/// <reference types="node" />
import { EventEmitter } from "events";
import { MapiConfig, MapiConnection } from "./mapi";
import PrepareStatement from "./PrepareStatement";
type MAPI_URI = string;
type ConnectCallback = (err?: Error) => void;
declare class Connection extends EventEmitter {
    autoCommit?: boolean;
    replySize?: number;
    sizeHeader?: boolean;
    mapi: MapiConnection;
    constructor(params: MapiConfig | MAPI_URI);
    connect(callback?: ConnectCallback): Promise<boolean>;
    close(): Promise<boolean>;
    commit(): Promise<void>;
    private command;
    execute(sql: string, stream?: boolean): Promise<any>;
    prepare(sql: string): Promise<PrepareStatement>;
    setAutocommit(v: boolean): Promise<boolean>;
    setReplySize(v: number): Promise<number>;
    setSizeHeader(v: boolean): Promise<boolean>;
    setTimezone(sec: number): Promise<any>;
    rollback(): Promise<void>;
}
export default Connection;
