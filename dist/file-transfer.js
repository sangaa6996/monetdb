"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDownloader = exports.FileUploader = void 0;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_process_1 = require("node:process");
class FileHandler {
    constructor(mapi, file) {
        this.mapi = mapi;
        this.file = file;
        this.state = 'init';
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.fhandle) {
                this.state = 'closed';
                yield this.fhandle.close();
                this.fhandle = undefined;
            }
        });
    }
    makePromise() {
        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
    ready() {
        return this.fhandle !== undefined
            && this.err === undefined
            && this.state === 'ready';
    }
    initTransfer(flag) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.fhandle === undefined) {
                // for security reasons we do 
                // expect file to be relative to cwd
                const fpath = path.join((0, node_process_1.cwd)(), this.file);
                if (fpath.startsWith((0, node_process_1.cwd)())) {
                    try {
                        this.fhandle = yield fs.open(fpath, flag);
                    }
                    catch (err) {
                        yield this.mapi.requestFileTransferError(`${err}\n`, this);
                        return this.makePromise();
                    }
                    // tell server we are okay with the download
                    // send magic new line
                    yield this.mapi.requestFileTransfer(Buffer.from('\n'), this);
                    this.state = 'ready';
                    if (flag === 'r')
                        this.eof = false;
                    return this.makePromise();
                }
                else {
                    // send err msg
                    yield this.mapi.requestFileTransferError('Forbidden\n', this);
                    return this.makePromise();
                }
            }
        });
    }
}
class FileDownloader extends FileHandler {
    constructor(mapi, file) {
        super(mapi, file);
        this.bytesWritten = 0;
    }
    download() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state === 'init')
                return this.initTransfer('w');
        });
    }
    writeChunk(data) {
        return __awaiter(this, void 0, void 0, function* () {
            let bytes = 0;
            if (this.ready()) {
                try {
                    const { bytesWritten, buffer } = yield this.fhandle.write(data);
                    bytes += bytesWritten;
                }
                catch (err) {
                    this.err = err;
                    try {
                        yield this.mapi.requestAbort();
                    }
                    catch (err) {
                        // pass
                        console.error(err);
                    }
                    yield this.close();
                    this.reject(err);
                    // kill connection
                    yield this.mapi.disconnect();
                    throw err;
                }
            }
            this.bytesWritten += bytes;
            return bytes;
        });
    }
}
exports.FileDownloader = FileDownloader;
class FileUploader extends FileHandler {
    constructor(mapi, file, skip = 0) {
        super(mapi, file);
        this.skip = skip > 0 ? skip - 1 : 0; // line based offset, super confusing
        this.bytesSent = 0;
        // configurable?
        this.chunkSize = 1024 * 1024;
    }
    upload() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.state === 'init')
                return this.initTransfer('r');
            try {
                yield this.sendChunk();
            }
            catch (err) {
                this.err = err;
                yield this.mapi.requestAbort();
                yield this.close();
                return this.reject(err);
            }
        });
    }
    sendChunk() {
        return __awaiter(this, void 0, void 0, function* () {
            let bytesRead = 0;
            let buffer = Buffer.alloc(0);
            do {
                const res = yield this.fhandle.read(Buffer.alloc(this.chunkSize), 0, this.chunkSize);
                bytesRead += res.bytesRead;
                const data = Buffer.concat([buffer, res.buffer]).toString('utf8');
                let offset = 0;
                let eol = data.indexOf('\n');
                while (this.skip && eol) {
                    offset = eol + 1;
                    this.skip--;
                    eol = data.indexOf('\n', offset);
                }
                buffer = Buffer.from(data).subarray(offset);
            } while (this.skip && this.bytesSent === 0);
            if (bytesRead > 0) {
                // console.log(`read ${bytesRead} bytes`)
                yield this.mapi.requestFileTransfer(buffer.subarray(0, bytesRead), this);
                this.bytesSent += bytesRead;
                // console.log(`sent ${bytesRead} bytes`)
            }
            else {
                // reached EOF
                this.eof = true;
                // console.log(`reached eof`);
                // send empty block to indicate end of upload
                yield this.mapi.requestFileTransfer(Buffer.from(''), this);
            }
        });
    }
}
exports.FileUploader = FileUploader;
//# sourceMappingURL=file-transfer.js.map