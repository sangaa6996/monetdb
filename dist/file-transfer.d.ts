/// <reference types="node" />
/// <reference types="node" />
import * as fs from 'node:fs/promises';
declare class FileHandler {
    mapi: any;
    file: string;
    state: string;
    err?: string;
    eof?: boolean;
    fhandle?: fs.FileHandle;
    resolve?: (v?: any) => void;
    reject?: (err?: Error) => void;
    constructor(mapi: any, file: string);
    close(): Promise<void>;
    protected makePromise(): Promise<void>;
    ready(): boolean;
    initTransfer(flag: 'r' | 'w'): Promise<void>;
}
declare class FileDownloader extends FileHandler {
    bytesWritten: number;
    constructor(mapi: any, file: string);
    download(): Promise<void>;
    writeChunk(data: Buffer): Promise<number>;
}
declare class FileUploader extends FileHandler {
    skip: number;
    bytesSent: number;
    chunkSize: number;
    eof: boolean;
    constructor(mapi: any, file: string, skip?: number);
    upload(): Promise<void>;
    private sendChunk;
}
export { FileUploader, FileDownloader };
