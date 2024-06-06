"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const monetize_1 = require("./monetize");
class PrepareStatement {
    constructor(res, mapi) {
        this.id = res.id;
        this.rowCnt = res.rowCnt;
        this.columnCnt = res.columnCnt;
        this.data = res.data; // columns and placeholder columns info
        this.mapi = mapi;
    }
    execute(...args) {
        const colInfo = this.data.slice(-args.length);
        const placeholders = args.map((arg, i) => {
            const type = colInfo[i][0];
            const digits = colInfo[i][1];
            const scale = colInfo[i][2];
            return (0, monetize_1.convert)(type, arg, digits, scale);
        });
        const query = `sEXECUTE ${this.id}(${placeholders.join(', ')});\n`;
        return this.mapi.request(query);
    }
    release() {
        const stmt = `sDEALLOCATE ${this.id};\n`;
        return this.mapi.request(stmt);
    }
}
exports.default = PrepareStatement;
//# sourceMappingURL=PrepareStatement.js.map