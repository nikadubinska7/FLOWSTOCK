import { promises as fs } from "fs";
import type { CsvRecord } from "@/lib/domain/types";

/** RFC-style quoted fields, escaped quotes and embedded newlines in planner comments. */
export function parseCsv(content: string): CsvRecord[] {
  const text=content.replace(/^\uFEFF/,""); const records:string[][]=[];
  let row:string[]=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;
    }else if(c===','&&!quoted){row.push(field);field="";}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(field);if(row.some(v=>v.length))records.push(row);row=[];field="";
    }else field+=c;
  }
  if(quoted)throw new Error('INVALID_CSV_QUOTING');
  if(field.length||row.length){row.push(field);records.push(row);}
  const headers=records.shift()?.map(v=>v.trim())??[];
  if(new Set(headers).size!==headers.length)throw new Error('DUPLICATE_CSV_HEADERS');
  return records.map(cells=>{
    if(cells.length!==headers.length)throw new Error('CSV_COLUMN_COUNT_MISMATCH');
    return Object.fromEntries(headers.map((h,i)=>[h,cells[i]]));
  });
}
export async function readCsv(filePath: string): Promise<CsvRecord[]> {
 return parseCsv(await fs.readFile(filePath,"utf8"));
}
