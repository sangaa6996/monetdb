"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryStream = exports.HandShakeOption = exports.createMapiConfig = exports.parseMapiUri = exports.MapiConnection = void 0;
const node_net_1 = require("node:net");
const events_1 = require("events");
const buffer_1 = require("buffer");
const node_crypto_1 = require("node:crypto");
const defaults_1 = __importDefault(require("./defaults"));
const node_url_1 = require("node:url");
const file_transfer_1 = require("./file-transfer");
const MAPI_BLOCK_SIZE = 1024 * 8 - 2;
const MAPI_HEADER_SIZE = 2;
const MSG_PROMPT = "";
const MSG_MORE = "\x01\x02\n";
const MSG_FILETRANS = "\x01\x03\n";
const MSG_INFO = "#";
const MSG_ERROR = "!";
const MSG_Q = "&";
const MSG_QTABLE = "&1";
const MSG_QUPDATE = "&2";
const MSG_QSCHEMA = "&3";
const MSG_QTRANS = "&4";
const MSG_QPREPARE = "&5";
const MSG_QBLOCK = "&6";
const MSG_HEADER = "%";
const MSG_TUPLE = "[";
const MSG_TUPLE_NOSLICE = "=";
const MSG_REDIRECT = "^";
const MSG_OK = "=OK";
const MAX_REDIRECTS = 10;
const MAX_BUFF_SIZE = buffer_1.constants.MAX_LENGTH;
var MAPI_STATE;
(function (MAPI_STATE) {
    MAPI_STATE[MAPI_STATE["INIT"] = 1] = "INIT";
    MAPI_STATE[MAPI_STATE["CONNECTED"] = 2] = "CONNECTED";
    MAPI_STATE[MAPI_STATE["READY"] = 3] = "READY";
})(MAPI_STATE || (MAPI_STATE = {}));
var MAPI_LANGUAGE;
(function (MAPI_LANGUAGE) {
    MAPI_LANGUAGE["SQL"] = "sql";
    MAPI_LANGUAGE["MAPI"] = "mapi";
    MAPI_LANGUAGE["CONTROL"] = "control";
})(MAPI_LANGUAGE || (MAPI_LANGUAGE = {}));
class HandShakeOption {
    constructor(level, name, value, fallback, sent = false) {
        this.level = level;
        this.name = name;
        this.value = value;
        this.fallback = fallback;
        this.sent = sent;
    }
}
exports.HandShakeOption = HandShakeOption;
function isMapiUri(uri) {
    const regx = new RegExp("^mapi:monetdb://*", "i");
    return regx.test(uri);
}
function parseMapiUri(uri) {
    if (isMapiUri(uri)) {
        const url = new node_url_1.URL(uri.substring(5));
        if (url.hostname) {
            const host = url.hostname;
            const port = parseInt(url.port);
            const username = url.username;
            const password = url.password;
            const database = url.pathname.split("/")[1];
            return {
                host,
                port,
                username,
                password,
                database,
            };
        }
    }
    throw new Error(`Invalid MAPI URI ${uri}!`);
}
exports.parseMapiUri = parseMapiUri;
// validates and sets defaults on missing properties
function createMapiConfig(params) {
    const database = params && params.database ? params.database : defaults_1.default.database;
    if (typeof database != "string") {
        throw new Error("database name must be string");
    }
    const username = params && params.username ? params.username : defaults_1.default.username;
    const password = params && params.password ? params.password : defaults_1.default.password;
    let host = params && params.host;
    const unixSocket = params && params.unixSocket;
    if (!unixSocket && !host)
        host = defaults_1.default.host;
    if (typeof host != "string") {
        throw new TypeError(`${host} is not valid hostname`);
    }
    const port = params && params.port ? Number(params.port) : Number(defaults_1.default.port);
    if (isNaN(port)) {
        throw new TypeError(`${port} is not valid port`);
    }
    const timeout = params && params.timeout ? Number(params.timeout) : undefined;
    if (timeout && isNaN(timeout)) {
        throw new TypeError("timeout must be number");
    }
    const language = params && params.language ? params.language : MAPI_LANGUAGE.SQL;
    const autoCommit = params.autoCommit || defaults_1.default.autoCommit;
    const replySize = params.replySize || defaults_1.default.replySize;
    return {
        database,
        username,
        password,
        language,
        host,
        port,
        timeout,
        unixSocket,
        autoCommit,
        replySize,
    };
}
exports.createMapiConfig = createMapiConfig;
class Column {
    constructor(table, name, type, index, length) {
        this.table = table;
        this.name = name;
        this.type = type;
        this.index = index;
        this.length = length;
    }
}
class QueryStream extends events_1.EventEmitter {
    constructor() {
        super();
    }
    end(res) {
        this.emit("end", res);
    }
}
exports.QueryStream = QueryStream;
function parseHeaderLine(hdrLine) {
    if (hdrLine.startsWith(MSG_HEADER)) {
        const [head, tail] = hdrLine.substring(1).trim().split("#");
        let res = {};
        const vals = head.trim().split(",\t");
        switch (tail.trim()) {
            case "table_name":
                res = { tableNames: vals };
                break;
            case "name":
                res = { columnNames: vals };
                break;
            case "type":
                res = { columnTypes: vals };
                break;
            default:
                res = {};
        }
        return res;
    }
    throw TypeError("Invalid header format!");
}
function parseTupleLine(line, types) {
    if (line.startsWith(MSG_TUPLE) && line.endsWith("]")) {
        var resultline = [];
        var cCol = 0;
        var curtok = "";
        var state = "INCRAP";
        let endQuotes = 0;
        /* mostly adapted from clients/R/MonetDB.R/src/mapisplit.c */
        for (var curPos = 2; curPos < line.length - 1; curPos++) {
            var chr = line.charAt(curPos);
            switch (state) {
                case "INCRAP":
                    if (chr != "\t" && chr != "," && chr != " ") {
                        if (chr == '"') {
                            state = "INQUOTES";
                        }
                        else {
                            state = "INTOKEN";
                            curtok += chr;
                        }
                    }
                    break;
                case "INTOKEN":
                    if (chr == "," || curPos == line.length - 2) {
                        if (curtok == "NULL" && endQuotes === 0) {
                            resultline.push(null);
                        }
                        else {
                            switch (types[cCol]) {
                                case "boolean":
                                    resultline.push(curtok == "true");
                                    break;
                                case "tinyint":
                                case "smallint":
                                case "int":
                                case "wrd":
                                case "bigint":
                                    resultline.push(parseInt(curtok));
                                    break;
                                case "real":
                                case "double":
                                case "decimal":
                                    resultline.push(parseFloat(curtok));
                                    break;
                                case "json":
                                    try {
                                        resultline.push(JSON.parse(curtok));
                                    }
                                    catch (e) {
                                        resultline.push(curtok);
                                    }
                                    break;
                                default:
                                    // we need to unescape double quotes
                                    //valPtr = valPtr.replace(/[^\\]\\"/g, '"');
                                    resultline.push(curtok);
                                    break;
                            }
                        }
                        cCol++;
                        state = "INCRAP";
                        curtok = "";
                        endQuotes = 0;
                    }
                    else {
                        curtok += chr;
                    }
                    break;
                case "ESCAPED":
                    state = "INQUOTES";
                    switch (chr) {
                        case "t":
                            curtok += "\t";
                            break;
                        case "n":
                            curtok += "\n";
                            break;
                        case "r":
                            curtok += "\r";
                            break;
                        default:
                            curtok += chr;
                    }
                    break;
                case "INQUOTES":
                    if (chr == '"') {
                        state = "INTOKEN";
                        endQuotes++;
                        break;
                    }
                    if (chr == "\\") {
                        state = "ESCAPED";
                        break;
                    }
                    curtok += chr;
                    break;
            }
        }
        return resultline;
    }
    throw TypeError("Invalid tuple format!");
}
class Response {
    constructor(opt = {}) {
        this.buff = buffer_1.Buffer.allocUnsafe(MAPI_BLOCK_SIZE).fill(0);
        this.offset = 0;
        this.parseOffset = 0;
        this.segments = [];
        this.settled = false;
        this.stream = opt.stream;
        this.callbacks = opt.callbacks;
        this.fileHandler = opt.fileHandler;
        if (opt.stream) {
            this.queryStream = new QueryStream();
            if (opt.callbacks && opt.callbacks.resolve)
                opt.callbacks.resolve(this.queryStream);
        }
    }
    append(data) {
        let srcStartIndx = 0;
        let srcEndIndx = srcStartIndx + data.length;
        const l = this.segments.length;
        let segment = (l > 0 && this.segments[l - 1]) || undefined;
        let bytesCopied = 0;
        let bytesProcessed = 0;
        if (!this.complete()) {
            // check if out of space
            if (this.buff.length - this.offset < data.length) {
                const bytes = this.expand(MAPI_BLOCK_SIZE);
            }
            if (segment === undefined || (segment && segment.isFull())) {
                const hdr = data.readUInt16LE(0);
                const last = (hdr & 1) === 1;
                const bytes = hdr >> 1;
                srcStartIndx = MAPI_HEADER_SIZE;
                srcEndIndx = srcStartIndx + Math.min(bytes, data.length);
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                segment = new Segment(bytes, last, this.offset, bytesCopied);
                this.segments.push(segment);
                this.offset += bytesCopied;
                bytesProcessed = MAPI_HEADER_SIZE + bytesCopied;
            }
            else {
                const byteCntToRead = segment.bytes - segment.bytesOffset;
                srcEndIndx = srcStartIndx + byteCntToRead;
                bytesCopied = data.copy(this.buff, this.offset, srcStartIndx, srcEndIndx);
                this.offset += bytesCopied;
                segment.bytesOffset += bytesCopied;
                // console.log(`segment is full ${segment.bytesOffset === segment.bytes}`);
                bytesProcessed = bytesCopied;
            }
            if (this.isQueryResponse()) {
                const tuples = [];
                const firstPackage = this.parseOffset === 0;
                this.parseOffset += this.parse(this.toString(this.parseOffset), tuples);
                if (tuples.length > 0) {
                    if (this.queryStream) {
                        // emit header once
                        if (firstPackage && this.result && this.result.columns) {
                            this.queryStream.emit("header", this.result.columns);
                        }
                        // emit tuples
                        this.queryStream.emit("data", tuples);
                    }
                    else {
                        this.result.data = this.result.data || [];
                        for (let t of tuples) {
                            this.result.data.push(t);
                        }
                    }
                }
            }
        }
        return bytesProcessed;
    }
    complete() {
        const l = this.segments.length;
        if (l > 0) {
            const segment = this.segments[l - 1];
            return segment.last && segment.isFull();
        }
        return false;
    }
    seekOffset() {
        const len = this.segments.length;
        if (len) {
            const last = this.segments[len - 1];
            if (last.isFull())
                return last.offset + last.bytes;
            return last.offset;
        }
        return 0;
    }
    expand(byteCount) {
        if (this.buff.length + byteCount > MAX_BUFF_SIZE &&
            this.fileHandler instanceof file_transfer_1.FileDownloader) {
            const offset = this.seekOffset();
            if (offset) {
                this.fileHandler.writeChunk(this.buff.subarray(0, offset));
                this.buff = this.buff.subarray(offset);
                this.offset -= offset;
            }
        }
        const buff = buffer_1.Buffer.allocUnsafe(this.buff.length + byteCount).fill(0);
        const bytesCopied = this.buff.copy(buff);
        this.buff = buff;
        // should be byteCount
        return this.buff.length - bytesCopied;
    }
    firstCharacter() {
        return this.buff.toString("utf8", 0, 1);
    }
    errorMessage() {
        if (this.firstCharacter() === MSG_ERROR) {
            return this.buff.toString("utf8", 1);
        }
        return "";
    }
    isFileTransfer() {
        return this.toString().startsWith(MSG_FILETRANS);
    }
    isPrompt() {
        // perhaps use toString
        return this.complete() && this.firstCharacter() === "\x00";
    }
    isRedirect() {
        return this.firstCharacter() === MSG_REDIRECT;
    }
    isQueryResponse() {
        if (this.result && this.result.type) {
            return this.result.type.startsWith(MSG_Q);
        }
        return this.firstCharacter() === MSG_Q;
    }
    isMsgMore() {
        // server wants more ?
        return this.toString().startsWith(MSG_MORE);
    }
    toString(start) {
        const res = this.buff.toString("utf8", 0, this.offset);
        if (start)
            return res.substring(start);
        return res;
    }
    settle(res) {
        if (this.settled === false && this.complete()) {
            const errMsg = this.errorMessage();
            const err = errMsg ? new Error(errMsg) : null;
            if (this.queryStream) {
                if (err)
                    this.queryStream.emit("error", err);
                this.queryStream.end();
            }
            else {
                if (this.callbacks) {
                    if (err) {
                        this.callbacks.reject(err);
                    }
                    else {
                        this.callbacks.resolve(res || this.result);
                    }
                }
                else if (this.fileHandler && this.isQueryResponse()) {
                    this.fileHandler.resolve(this.result);
                }
                else if (this.fileHandler && (err || this.fileHandler.err)) {
                    this.fileHandler.reject(err || this.fileHandler.err);
                }
            }
            this.settled = true;
        }
    }
    parse(data, res) {
        let offset = 0;
        const lines = data.split("\n").length;
        if (this.isQueryResponse()) {
            let eol = data.indexOf("\n");
            this.result = this.result || {};
            if (this.result.type === undefined &&
                data.startsWith(MSG_Q) &&
                lines > 0) {
                // process 1st line
                const line = data.substring(0, eol);
                this.result.type = line.substring(0, 2);
                const rest = line.substring(3).trim().split(" ");
                if (this.result.type === MSG_QTABLE) {
                    const [id, rowCnt, columnCnt, rows, queryId, queryTime, malOptimizerTime, sqlOptimizerTime,] = rest;
                    this.result.id = parseInt(id);
                    this.result.rowCnt = parseInt(rowCnt);
                    this.result.columnCnt = parseInt(columnCnt);
                    this.result.queryId = parseInt(queryId);
                    this.result.queryTime = parseInt(queryTime);
                    this.result.malOptimizerTime = parseInt(malOptimizerTime);
                    this.result.sqlOptimizerTime = parseInt(sqlOptimizerTime);
                }
                else if (this.result.type === MSG_QUPDATE) {
                    const [affectedRowCnt, autoIncrementId, queryId, queryTime, malOptimizerTime, sqlOptimizerTime,] = rest;
                    this.result.affectedRows = parseInt(affectedRowCnt);
                    this.result.queryId = parseInt(queryId);
                    this.result.queryTime = parseInt(queryTime);
                    this.result.malOptimizerTime = parseInt(malOptimizerTime);
                    this.result.sqlOptimizerTime = parseInt(sqlOptimizerTime);
                }
                else if (this.result.type === MSG_QSCHEMA) {
                    const [queryTime, malOptimizerTime] = rest;
                    this.result.queryTime = parseInt(queryTime);
                    this.result.malOptimizerTime = parseInt(malOptimizerTime);
                }
                else if (this.result.type === MSG_QTRANS) {
                    // skip
                }
                else if (this.result.type === MSG_QPREPARE) {
                    const [id, rowCnt, columnCnt, rows] = rest;
                    this.result.id = parseInt(id);
                    this.result.rowCnt = parseInt(rowCnt);
                    this.result.columnCnt = parseInt(columnCnt);
                }
                // end 1st line
                if (this.headers === undefined &&
                    data.charAt(eol + 1) === MSG_HEADER &&
                    lines > 5) {
                    let headers = {};
                    while (data.charAt(eol + 1) === MSG_HEADER) {
                        const hs = eol + 1;
                        eol = data.indexOf("\n", hs);
                        headers = Object.assign(Object.assign({}, headers), parseHeaderLine(data.substring(hs, eol)));
                    }
                    this.headers = headers;
                    const colums = [];
                    for (let i = 0; i < this.result.columnCnt; i++) {
                        const table = headers.tableNames && headers.tableNames[i];
                        const name = headers.columnNames && headers.columnNames[i];
                        const type = headers.columnTypes && headers.columnTypes[i];
                        colums.push({
                            table,
                            name,
                            type,
                            index: i,
                        });
                    }
                    this.result.columns = colums;
                }
            }
            offset = eol + 1;
            let ts = undefined; // tuple index
            if (data.startsWith(MSG_TUPLE)) {
                ts = 0;
            }
            else if (data.charAt(eol + 1) === MSG_TUPLE) {
                ts = eol + 1;
                eol = data.indexOf("\n", ts);
            }
            if (ts !== undefined && eol > 0) {
                // we have a data row
                do {
                    offset = eol + 1;
                    const tuple = parseTupleLine(data.substring(ts, eol), this.headers.columnTypes);
                    res.push(tuple);
                    if (data.charAt(eol + 1) === MSG_TUPLE) {
                        ts = eol + 1;
                        eol = data.indexOf("\n", ts);
                    }
                    else {
                        ts = undefined;
                    }
                } while (ts && eol > -1);
            }
        }
        return offset;
    }
}
class Segment {
    constructor(bytes, last, offset, bytesOffset) {
        this.bytes = bytes;
        this.last = last;
        this.offset = offset;
        this.bytesOffset = bytesOffset;
    }
    isFull() {
        return this.bytes === this.bytesOffset;
    }
}
class MapiConnection extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.createSocket = (timeout) => {
            const socket = new node_net_1.Socket();
            if (timeout)
                socket.setTimeout(timeout);
            socket.addListener("data", this.recv.bind(this));
            socket.addListener("error", this.handleSocketError.bind(this));
            socket.addListener("timeout", this.handleTimeout.bind(this));
            socket.addListener("close", () => {
                console.log("socket close event");
                this.emit("end");
            });
            return socket;
        };
        this.state = MAPI_STATE.INIT;
        this.socket = this.createSocket(config.timeout);
        // this.socket = new Socket();
        // if (config.timeout) this.socket.setTimeout(config.timeout);
        // this.socket.addListener("data", this.recv.bind(this));
        // this.socket.addListener("error", this.handleSocketError.bind(this));
        // this.socket.addListener("timeout", this.handleTimeout.bind(this));
        // this.socket.addListener("close", () => {
        //   console.log("socket close event");
        //   this.emit("end");
        // });
        this.redirects = 0;
        this.queue = [];
        this.database = config.database;
        this.language = config.language || MAPI_LANGUAGE.SQL;
        this.unixSocket = config.unixSocket;
        this.host = config.host;
        this.port = config.port;
        this.username = config.username;
        this.password = config.password;
        this.timeout = config.timeout;
    }
    connect(handShakeOptions = []) {
        this.handShakeOptions = handShakeOptions;
        // TODO unix socket
        const opt = {
            port: this.port,
            host: this.host,
            noDelay: true,
        };
        const socket = this.socket && !this.socket.destroyed
            ? this.socket
            : this.createSocket(this.timeout);
        socket.connect(opt, () => {
            this.state = MAPI_STATE.CONNECTED;
            this.socket.setKeepAlive(true);
        });
        this.socket = socket;
        return (0, events_1.once)(this, "ready");
    }
    ready() {
        return this.state === MAPI_STATE.READY;
    }
    disconnect() {
        return new Promise((resolve, reject) => {
            this.socket.end(() => {
                this.redirects = 0;
                this.state = MAPI_STATE.INIT;
                this.socket.destroy();
                resolve(this.state === MAPI_STATE.INIT);
            });
        });
    }
    login(challenge) {
        const challengeParts = challenge.split(":");
        const [salt, identity, protocol, hashes, endian, algo, opt_level] = challengeParts;
        let password;
        try {
            password = (0, node_crypto_1.createHash)(algo).update(this.password).digest("hex");
        }
        catch (err) {
            console.error(err);
            this.emit("error", new TypeError(`Algorithm ${algo} not supported`));
            return;
        }
        let pwhash = null;
        // try hash algorithms in the order provided by the server
        for (const algo of hashes.split(",")) {
            try {
                const hash = (0, node_crypto_1.createHash)(algo);
                pwhash = `{${algo}}` + hash.update(password + salt).digest("hex");
                break;
            }
            catch (_a) { }
        }
        if (pwhash) {
            let counterResponse = `LIT:${this.username}:${pwhash}:${this.language}:${this.database}:`;
            if (opt_level && opt_level.startsWith("sql=")) {
                let level = 0;
                counterResponse += "FILETRANS:";
                try {
                    level = Number(opt_level.substring(4));
                }
                catch (err) {
                    this.emit("error", new TypeError("Invalid handshake options level in server challenge"));
                    return;
                }
                // process handshake options
                const options = [];
                for (const opt of this.handShakeOptions) {
                    if (opt.level < level) {
                        options.push(`${opt.name}=${Number(opt.value)}`);
                        opt.sent = true;
                    }
                }
                if (options)
                    counterResponse += options.join(",") + ":";
            }
            this.send(buffer_1.Buffer.from(counterResponse))
                .then(() => this.queue.push(new Response()))
                .catch((err) => this.emit("error", err));
        }
        else {
            this.emit("error", new TypeError(`None of the hashes ${hashes} are supported`));
        }
    }
    /**
     * Raise exception on server by sending bad packet
     */
    requestAbort() {
        return new Promise((resolve, reject) => {
            const header = buffer_1.Buffer.allocUnsafe(2).fill(0);
            // larger than allowed and not final message
            header.writeUint16LE(((2 * MAPI_BLOCK_SIZE) << 1) | 0, 0);
            // invalid utf8 and too small
            const badBody = buffer_1.Buffer.concat([
                buffer_1.Buffer.from("ERROR"),
                buffer_1.Buffer.from([0x80]),
            ]);
            const outBuff = buffer_1.Buffer.concat([header, badBody]);
            this.socket.write(outBuff, (err) => __awaiter(this, void 0, void 0, function* () {
                if (err)
                    reject(err);
                resolve();
            }));
        });
    }
    send(buff) {
        return new Promise((resolve, reject) => {
            let last = 0;
            let offset = 0;
            while (last === 0) {
                const seg = buff.subarray(offset, offset + MAPI_BLOCK_SIZE);
                last = seg.length < MAPI_BLOCK_SIZE ? 1 : 0;
                const header = buffer_1.Buffer.allocUnsafe(2).fill(0);
                header.writeUint16LE((seg.length << 1) | last, 0);
                const outBuff = buffer_1.Buffer.concat([header, seg]);
                this.socket.write(outBuff, (err) => {
                    if (err)
                        reject(err);
                    if (last)
                        resolve();
                });
                offset += seg.length;
            }
        });
    }
    handleTimeout() {
        this.emit("error", new Error("Timeout"));
    }
    handleSocketError(err) {
        console.error(err);
    }
    request(sql, stream = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.ready() === false)
                throw new Error("Not Connected");
            yield this.send(buffer_1.Buffer.from(sql));
            return new Promise((resolve, reject) => {
                const resp = new Response({
                    stream,
                    callbacks: { resolve, reject },
                });
                this.queue.push(resp);
            });
        });
    }
    requestFileTransfer(buff, fileHandler) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.send(buff);
            const resp = new Response({ fileHandler });
            this.queue.push(resp);
        });
    }
    requestFileTransferError(err, fileHandler) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.send(buffer_1.Buffer.from(err));
            const resp = new Response({ fileHandler });
            this.queue.push(resp);
        });
    }
    recv(data) {
        let bytesLeftOver;
        let resp;
        // process queue left to right, find 1st uncomplete response
        // remove responses that are completed
        while (this.queue.length) {
            const next = this.queue[0];
            if (next.complete() || next.settled) {
                this.queue.shift();
            }
            else {
                resp = next;
                break;
            }
        }
        if (resp === undefined && this.queue.length === 0) {
            // challenge message
            // or direct call to send has being made
            // e.g. request api appends Response to the queue
            resp = new Response();
            this.queue.push(resp);
        }
        const offset = resp.append(data);
        if (resp.complete())
            this.handleResponse(resp);
        bytesLeftOver = data.length - offset;
        if (bytesLeftOver) {
            this.recv(data.subarray(offset));
        }
    }
    handleResponse(resp) {
        const err = resp.errorMessage();
        if (this.state == MAPI_STATE.CONNECTED) {
            if (err) {
                this.emit("error", new Error(err));
                return;
            }
            if (resp.isRedirect()) {
                this.redirects += 1;
                if (this.redirects > MAX_REDIRECTS)
                    this.emit("error", new Error(`Exceeded max number of redirects ${MAX_REDIRECTS}`));
                return;
            }
            if (resp.isPrompt()) {
                console.log("login OK");
                this.state = MAPI_STATE.READY;
                this.emit("ready", this.state);
                return;
            }
            return this.login(resp.toString());
        }
        if (resp.isFileTransfer()) {
            console.log("file transfer");
            let fhandler;
            const msg = resp.toString(MSG_FILETRANS.length).trim();
            let mode, offset, file;
            if (msg.startsWith("r ")) {
                [mode, offset, file] = msg.split(" ");
                fhandler =
                    resp.fileHandler || new file_transfer_1.FileUploader(this, file, parseInt(offset));
                return resp.settle(fhandler.upload());
            }
            else if (msg.startsWith("rb")) {
                [mode, file] = msg.split(" ");
                fhandler = resp.fileHandler || new file_transfer_1.FileUploader(this, file, 0);
                return resp.settle(fhandler.upload());
            }
            else if (msg.startsWith("w")) {
                [mode, file] = msg.split(" ");
                fhandler = resp.fileHandler || new file_transfer_1.FileDownloader(this, file);
                return resp.settle(fhandler.download());
            }
            else {
                // no msg end of transfer
                const fileHandler = resp.fileHandler;
                // we do expect a final response from server
                this.queue.push(new Response({ fileHandler }));
                return resp.settle(fileHandler.close());
            }
        }
        if (resp.isMsgMore()) {
            // console.log("server wants more");
            if (resp.fileHandler instanceof file_transfer_1.FileUploader)
                return resp.settle(resp.fileHandler.upload());
        }
        if (resp.fileHandler instanceof file_transfer_1.FileDownloader &&
            resp.fileHandler.ready()) {
            // end of download
            const fileHandler = resp.fileHandler;
            fileHandler.writeChunk(resp.buff);
            // we do expect a final response from server
            this.queue.push(new Response({ fileHandler }));
            return resp.settle(fileHandler.close());
        }
        resp.settle();
    }
}
exports.MapiConnection = MapiConnection;
//# sourceMappingURL=mapi.js.map