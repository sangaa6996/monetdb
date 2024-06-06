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
const events_1 = require("events");
const mapi_1 = require("./mapi");
const PrepareStatement_1 = __importDefault(require("./PrepareStatement"));
class Connection extends events_1.EventEmitter {
    constructor(params) {
        super();
        const config = typeof params === "string"
            ? (0, mapi_1.createMapiConfig)((0, mapi_1.parseMapiUri)(params))
            : (0, mapi_1.createMapiConfig)(params);
        this.mapi = new mapi_1.MapiConnection(config);
        this.autoCommit = config.autoCommit;
        this.replySize = config.replySize;
    }
    connect(callback) {
        const options = [
            new mapi_1.HandShakeOption(1, "auto_commit", this.autoCommit, this.setAutocommit),
            new mapi_1.HandShakeOption(2, "reply_size", this.replySize, this.setReplySize),
            new mapi_1.HandShakeOption(3, "size_header", true, this.setSizeHeader),
            new mapi_1.HandShakeOption(5, "time_zone", new Date().getTimezoneOffset() * 60, this.setTimezone),
        ];
        const mapi = this.mapi;
        return new Promise(function (resolve, reject) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    yield mapi.connect(options);
                    resolve(mapi.ready());
                    if (callback)
                        callback();
                }
                catch (err) {
                    reject(err);
                    if (callback)
                        callback(err);
                }
            });
        });
    }
    close() {
        return this.mapi.disconnect();
    }
    commit() {
        return this.execute("COMMIT");
    }
    command(str) {
        return this.mapi.request(str);
    }
    execute(sql, stream = false) {
        const query = `s${sql};\n`;
        if (stream && this.replySize !== -1)
            this.setReplySize(-1);
        return this.mapi.request(query, stream);
    }
    prepare(sql) {
        return __awaiter(this, void 0, void 0, function* () {
            const prepSQL = `PREPARE ${sql}`;
            const res = yield this.execute(prepSQL);
            return new PrepareStatement_1.default(res, this.mapi);
        });
    }
    setAutocommit(v) {
        const cmd = `Xauto_commit ${Number(v)}`;
        return this.command(cmd).then(() => {
            this.autoCommit = v;
            return this.autoCommit;
        });
    }
    setReplySize(v) {
        const cmd = `Xreply_size ${Number(v)}`;
        return this.command(cmd).then(() => {
            this.replySize = Number(v);
            return this.replySize;
        });
    }
    setSizeHeader(v) {
        const cmd = `Xsizeheader ${Number(v)}`;
        return this.command(cmd).then(() => {
            this.sizeHeader = v;
            return this.sizeHeader;
        });
    }
    setTimezone(sec) {
        const qry = `SET TIME ZONE INTERVAL '${sec}' SECOND`;
        return this.execute(qry);
    }
    rollback() {
        return this.execute("ROLLBACK");
    }
}
exports.default = Connection;
//# sourceMappingURL=connection.js.map