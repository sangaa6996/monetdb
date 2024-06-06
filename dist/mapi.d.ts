/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { Socket } from "node:net";
import { EventEmitter } from "events";
import { Buffer } from "buffer";
declare enum MAPI_STATE {
    INIT = 1,
    CONNECTED = 2,
    READY = 3
}
declare enum MAPI_LANGUAGE {
    SQL = "sql",
    MAPI = "mapi",
    CONTROL = "control"
}
interface MapiConfig {
    database: string;
    username?: string;
    password?: string;
    language?: MAPI_LANGUAGE;
    host?: string;
    port?: number;
    unixSocket?: string;
    timeout?: number;
    autoCommit?: boolean;
    replySize?: number;
}
declare class HandShakeOption {
    level: number;
    name: string;
    value: any;
    fallback?: (v: any) => void;
    sent: boolean;
    constructor(level: number, name: string, value: any, fallback: (v: any) => void, sent?: boolean);
}
declare function parseMapiUri(uri: string): MapiConfig;
declare function createMapiConfig(params: MapiConfig): MapiConfig;
declare class Column {
    table: string;
    name: string;
    type: string;
    length?: number;
    index?: number;
    constructor(table: string, name: string, type: string, index?: number, length?: number);
}
type QueryResult = {
    id?: number;
    type?: string;
    queryId?: number;
    rowCnt?: number;
    affectedRows?: number;
    columnCnt?: number;
    queryTime?: number;
    sqlOptimizerTime?: number;
    malOptimizerTime?: number;
    columns?: Column[];
    headers?: ResponseHeaders;
    data?: any[];
};
declare class QueryStream extends EventEmitter {
    constructor();
    end(res?: QueryResult): void;
}
interface ResponseCallbacks {
    resolve: (v: QueryResult | QueryStream | Promise<any>) => void;
    reject: (err: Error) => void;
}
interface ResponseHeaders {
    tableNames?: string[];
    columnNames?: string[];
    columnTypes?: string[];
}
interface ResponseOpt {
    stream?: boolean;
    callbacks?: ResponseCallbacks;
    fileHandler?: any;
}
declare class Response {
    buff: Buffer;
    offset: number;
    parseOffset: number;
    stream: boolean;
    settled: boolean;
    segments: Segment[];
    result?: QueryResult;
    callbacks: ResponseCallbacks;
    queryStream?: QueryStream;
    headers?: ResponseHeaders;
    fileHandler: any;
    constructor(opt?: ResponseOpt);
    append(data: Buffer): number;
    complete(): boolean;
    private seekOffset;
    private expand;
    private firstCharacter;
    errorMessage(): string;
    isFileTransfer(): boolean;
    isPrompt(): boolean;
    isRedirect(): boolean;
    isQueryResponse(): boolean;
    isMsgMore(): boolean;
    toString(start?: number): string;
    settle(res?: Promise<any>): void;
    parse(data: string, res: any[]): number;
}
declare class Segment {
    offset: number;
    bytes: number;
    bytesOffset: number;
    last: boolean;
    constructor(bytes: number, last: boolean, offset: number, bytesOffset: number);
    isFull(): boolean;
}
declare class MapiConnection extends EventEmitter {
    state: MAPI_STATE;
    socket: Socket;
    database: string;
    timeout: number;
    username: string;
    password: string;
    host?: string;
    unixSocket?: string;
    port: number;
    language: MAPI_LANGUAGE;
    handShakeOptions?: HandShakeOption[];
    redirects: number;
    queue: Response[];
    constructor(config: MapiConfig);
    private createSocket;
    connect(handShakeOptions?: HandShakeOption[]): Promise<any[]>;
    ready(): boolean;
    disconnect(): Promise<boolean>;
    private login;
    /**
     * Raise exception on server by sending bad packet
     */
    requestAbort(): Promise<void>;
    send(buff: Buffer): Promise<void>;
    private handleTimeout;
    private handleSocketError;
    request(sql: string, stream?: boolean): Promise<QueryResult | QueryStream>;
    requestFileTransfer(buff: Buffer, fileHandler: any): Promise<void>;
    requestFileTransferError(err: string, fileHandler: any): Promise<void>;
    private recv;
    private handleResponse;
}
export { MapiConfig, MapiConnection, parseMapiUri, createMapiConfig, HandShakeOption, QueryResult, QueryStream, };
