"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convert = void 0;
function monetEscape(v) {
    let s = String(v).replace("\\", "\\\\");
    s = s.replace("\'", "\\\'");
    return `'${s}'`;
}
function monetDecimal(v, digits, scale) {
    if (digits && scale)
        return `cast(${monetEscape(v)} as decimal(${digits}, ${scale}))`;
    return `cast(${monetEscape(v)} as decimal)`;
}
function monetDate(v) {
    return `DATE${monetEscape(v)}`;
}
function monetTime(v) {
    return `TIME${monetEscape(v)}`;
}
function monetTimestamp(v) {
    return `TIMESTAMP${monetEscape(v)}`;
}
function monetTimestampZone(v) {
    return `TIMESTAMPZ${monetEscape(v)}`;
}
function monetUUID(v) {
    return `UUID${monetEscape(v)}`;
}
function convert(type, v, digits, scale) {
    switch (type) {
        case "smallint":
        case "int":
        case "bigint":
        case "hugeint":
        case "double":
        case "float":
            return Number(v);
        case "decimal":
            return monetDecimal(v, digits, scale);
        case "boolean":
            return Boolean(v);
        case "date":
            return monetDate(v);
        case "time":
            return monetTime(v);
        case "timestamp":
            return monetTimestamp(v);
        case "timestampz":
            return monetTimestampZone(v);
        case "uuid":
            return monetUUID(v);
        default:
            return monetEscape(v);
    }
}
exports.convert = convert;
//# sourceMappingURL=monetize.js.map