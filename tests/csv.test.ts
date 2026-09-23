import {it,expect} from 'vitest';
import {parseCsv} from '../src/lib/csv/readCsv';
it('preserves quoted multiline planner comments and rejects invalid schemas',()=>{
 expect(parseCsv('id,comment\r\n1,"First line\nSecond, ""quoted"" line"\r\n')).toEqual([{id:'1',comment:'First line\nSecond, "quoted" line'}]);
 expect(()=>parseCsv('id,id\n1,2')).toThrow('DUPLICATE_CSV_HEADERS');
 expect(()=>parseCsv('id,comment\n1,"unfinished')).toThrow('INVALID_CSV_QUOTING');
});
