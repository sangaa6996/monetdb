import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { cwd } from 'node:process';


class FileUploader {
    mapi: any;
    file: string;
    skip: number;
    bytesSent: number;
    chunkSize: number;
    eof: boolean;
    fhandle?: fs.FileHandle;

    private resolve: (v?: any) => void;
    private reject: (err?: Error) => void;
    
    constructor(mapi: any, file: string, skip: number = 0) {
        this.mapi = mapi;
        this.file = file;
        this.skip = skip;
        this.bytesSent = 0;
        // configurable?
        this.chunkSize = 1024 * 1024;
    }

    async close(serverErrMessage?: string): Promise<void> {
        if (this.fhandle)
            return await this.fhandle.close();
    }

    async upload(): Promise<void> {
        if (this.fhandle === undefined) {
            // for security reasons we do 
            // expect file to be relative to cwd
            const fpath = path.join(cwd(), this.file);
            if (fpath.startsWith(cwd())) {
                this.fhandle = await fs.open(fpath, 'r');
                this.eof = false;
                // tell server we are okay with the upload
                // send magic new line
                await this.mapi.requestUpload(Buffer.from('\n'), this);
                return this.makePromise();
            } else {
                // send err msg
                await this.mapi.requestFileTransferError('Forbidden\n', this);
                return this.makePromise();
            }
        }
        return this.sendChunk();
    }

    private makePromise(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    private async sendChunk(): Promise<void> {
        const { bytesRead, buffer } = await this.fhandle.read(Buffer.alloc(this.chunkSize), 0, this.chunkSize);
        if (bytesRead > 0) {
            console.log(`read ${bytesRead} bytes`)
            await this.mapi.requestUpload(buffer.subarray(0, bytesRead), this);
            this.bytesSent += bytesRead;
            console.log(`sent ${bytesRead} bytes`)
        } else {
            // reached EOF
            this.eof = true;
            console.log(`reached eof`);
            // send empty block to indicate end of upload
            await this.mapi.requestUpload(Buffer.from(''), this);
        }
        /// do we need to resolve after each send chunk?
        // return this.resolve(this.makePromise());
    }
}

export { FileUploader };

