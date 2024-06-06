"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const defaults = {
    host: process.env.MAPI_HOST || "localhost",
    port: process.env.MAPI_PORT || 50000,
    username: process.env.MAPI_USER || "monetdb",
    password: process.env.MAPI_PASSWORD || "monetdb",
    database: process.env.MAPI_DATABASE,
    autoCommit: false,
    replySize: -1,
};
exports.default = defaults;
//# sourceMappingURL=defaults.js.map