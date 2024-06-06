import { MapiConnection, QueryResult } from './mapi';
declare class PrepareStatement {
    id: number;
    rowCnt: number;
    columnCnt: number;
    mapi: MapiConnection;
    data: any[];
    constructor(res: QueryResult, mapi: MapiConnection);
    execute(...args: any[]): Promise<any>;
    release(): Promise<any>;
}
export default PrepareStatement;
