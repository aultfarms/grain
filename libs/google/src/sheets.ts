import { client } from './core';
import { createFile, ensurePath, idFromPath, getFileContents, ls } from './drive';
import xlsx from 'xlsx-js-style';
import debug from 'debug';
//import pReduce from 'p-reduce';
import moment, { isMoment, type Moment } from 'moment';

import type { sheets_v4 as Sheets } from '@googleapis/sheets';

const warn = debug('af/google#sheets:warn');
const info = debug('af/google#sheets:info');
const trace = debug('af/google#sheets:trace');

export const XlsxMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const GoogleSheetsMimeType = "application/vnd.google-apps.spreadsheet";
// From: https://stackoverflow.com/questions/175739/how-can-i-check-if-a-string-is-a-valid-number (lower-down post about typescript)
const isNumeric = (num: unknown) => (typeof(num) === 'number' || typeof(num) === "string" && num.trim() !== '') && !isNaN(num as number);

// Handy type to keep your spreadsheet info as you pass it around
export type SpreadsheetInfo = {
  id: string, // ID of the spreadsheet file in Google Drive
  path: string, // original path+filename of the spreadsheet
  worksheetName: string, // name of worksheet in the spreadsheet that you want to read/edit
}

async function sheets(): Promise<Sheets.Sheets> {
  // @ts-ignore
  return ((await client()).sheets as Sheets.Sheets);
}

export async function googleSheetToXlsxWorkbook({ id }: { id: string }): Promise<xlsx.WorkBook> {
  const arraybuffer = await getFileContents({ id, exportMimeType: XlsxMimeType });
  return xlsx.read(arraybuffer, { type: 'array' });
}

export function arrayToLetterRange(row:string|number,arr:any[]):string {
  const startletter = 'A';
  const end = arr.length-1;
  let endletter = String.fromCharCode(65+end);
  if (arr.length > 25) { // more than a single letter can represent
    const mostsig = String.fromCharCode(65+Math.trunc(end/26)); // integer division
    const leastsig = String.fromCharCode(65+(end%26)); // remainder
    endletter = mostsig+leastsig;
  }
  return startletter+row+':'+endletter+row;
}

export async function getAllRows(
  { id, worksheetName }:
  { id: string, worksheetName: string }
): Promise<Sheets.Schema$ValueRange> {
  const res = await ((await sheets()).spreadsheets.values.get({
    spreadsheetId: id,
    range: worksheetName+'!A:ZZ',
  }));
  await cachedWorksheetNumAvailableRows({ id, worksheetName, forceUpdate: true });
  // Not sure why result is not on the type
  // @ts-ignore
  return res.result;
}

const _sheetNumAvailableRowsCache: {[key: string]: number} = {};
export async function cachedWorksheetNumAvailableRows({ id, worksheetName, forceUpdate }: { id: string, worksheetName: string, forceUpdate?: boolean }): Promise<number> {
  const key = id + ':' + worksheetName;
  if (forceUpdate || typeof _sheetNumAvailableRowsCache[key] === 'undefined') {
    _sheetNumAvailableRowsCache[key] = await worksheetNumAvailableRows({ id, worksheetName });
  }
  return _sheetNumAvailableRowsCache[key]!;
}

export async function ensureSheetHasEnoughRows({ id, worksheetName, row }: { id: string, worksheetName: string, row: number }) {
  const numAvailableRows = await cachedWorksheetNumAvailableRows({ id, worksheetName });
  if (row < numAvailableRows) return; // sheet is big enough
  let length = 1000;
  if (row - numAvailableRows >= 1000) length += row - numAvailableRows; // always add 1000 more rows than we need
  const request: gapi.client.sheets.BatchUpdateSpreadsheetRequest = { requests: [ {
    appendDimension: {
      sheetId: await worksheetIdFromName({ id, name: worksheetName }),
      dimension: 'ROWS',
      length,
    },
  } ] };
  await (await client()).sheets.spreadsheets.batchUpdate({spreadsheetId: id}, request);
  // Update the cache with the new number.  Use google's number in case I messed up math
  await cachedWorksheetNumAvailableRows({ id, worksheetName, forceUpdate: true });
}

// cols is just an array of your data, in order by the columns you want to
// put it at.  i.e. cols[0] will go in column A, cols[1] in B, etc. in your chosen row.
export async function putRow(
  {id,row,cols,worksheetName,rawVsUser}
: {id: string, row: string, cols: string[], worksheetName: string, rawVsUser?: 'USER_ENTERED' | 'RAW'}
) {
  if (!rawVsUser) rawVsUser = 'RAW'; // this is what putRow originally did
  // If they pass what they do not pass what they think is the current number of rows, grab it from Google first:
  await ensureSheetHasEnoughRows({ id, worksheetName, row: (+row) });

  //const range = worksheetName+'!'+arrayToLetterRange(row,cols);
  let params = {
    spreadsheetId: id,
    range: worksheetName+'!'+arrayToLetterRange(row,cols),
    includeValuesInResponse: true,
    valueInputOption: rawVsUser,
  };
  const data = {
    range: worksheetName+'!'+arrayToLetterRange(row,cols),
    majorDimension: 'ROWS',
    values: [ cols ],
  };
  const result = await ((await client()).sheets.spreadsheets.values.update(params, data));
  return result.result.updatedData?.values?.[0];
}

export type RowObject = {
  lineno: number,
  [key: string]: string | Moment | number,
};
export function rowObjectToArray({ row, header }: { row: RowObject, header: string[] }): (string | number)[] {
  const ret: (string | number)[] = [];
  for (const key of header) {
    const val = row[key];
    if (typeof val === 'number') {
      ret.push(val);
      continue;
    }
    if (!val) { // undefined or '' or null.  numeric 0 handled above
      ret.push('');
      continue;
    }
    if (isMoment(val)) {
      ret.push((val as Moment).format('YYYY-MM-DD'));
      continue;
    }
    ret.push(val);
  }
  return ret;
}

// "The whole number portion of the value (left of the decimal) counts the days since December 30th 1899"
// https://developers.google.com/sheets/api/reference/rest/v4/DateTimeRenderOption
function dateStringToDateSerialNumber(datestr: string): number {
  const date = moment(datestr, 'YYYY-MM-DD');
  const originDate = moment('1899-12-30', 'YYYY-MM-DD');
  return date.diff(originDate, 'days');
}

//------------------------------------------------------------
// batchInsert is tricky with the lineno's.  I settled on you give
// this function lineno's as of the state of the sheet when you
// call this function.  i.e. if you need to insert 3 rows above
// lineno 5 (as final rows 5, 6, 7), then you'll give three row
// objects that all list the same lineno of 5, and they will end
// up as the first one line 5, the second line 6, and the third line 7,
// and the original line 5 will now be line 8.
//
// first new: lineno 5
// second new: lineno 5
// third new: lineno 5
//
// 4  orig4    ---> 4   orig4
// 5  orig5    +    5   first new
//             |    6   second new
//             |    7   third new
//             +--> 8   orig5
export async function batchUpsertRows(
  { id, worksheetName, rows, header, insertOrUpdate }: {
    id: string,
    worksheetName: string,
    rows: RowObject[],
    header: string[],
    insertOrUpdate: 'INSERT' | 'UPDATE',
}): Promise<void> {
  if (rows.length < 1) {
    throw new Error('ERROR: must have at least one row to batchUpsert');
  }
  const sheetId = await worksheetIdFromName({ id, name: worksheetName });

  const request: gapi.client.sheets.BatchUpdateSpreadsheetRequest = {
    requests: [],
  };
  // Make sure rows are in increasing lineno order:
  rows.sort((a,b) => a.lineno - b.lineno);

  let lineno_offset = 0; // increment this for every line inserted
  for (const row of rows) {

    // Insert a blank line first if in insert mode:
    const lineno = row.lineno + lineno_offset;
    if (insertOrUpdate === 'INSERT') {
      const insertRowRequest: gapi.client.sheets.Request = {
        insertDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: lineno-1, // startIndex is inclusive and zero-based
            endIndex: lineno,     // endIndex is exclusive
          },
          inheritFromBefore: true,
        }
      };
      request.requests!.push(insertRowRequest);
      lineno_offset++; // note lineno will remain the same through the "update" part for this row
    }

    // Update the row at lineno to have new values:
    const rowvals = rowObjectToArray({row, header});
    const updateCellsRequest: gapi.client.sheets.Request = {
      updateCells: {
        rows: [
          {  // A single row is an object with a "values" key, and each "value" is just a userEnteredValue
            values: rowvals.map(v => {
              if (typeof v === 'number') return { userEnteredValue: { numberValue: +(v) } };
              if (typeof v === 'object') return { userEnteredValue: { stringValue: JSON.stringify(v) } }; // notes
              if (typeof v === 'string') {
                if (!v) return { userEnteredValue: { stringValue: '' } };
                if (isNumeric(v)) return { userEnteredValue: { numberValue: +(v) } };
                if (v.match(/^=/)) return { userEnteredValue: { formulaValue: v } };
                // Dates have to be serial numbers to keep the formatting
                if (v.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) return { userEnteredValue: { numberValue: dateStringToDateSerialNumber(v) } };
                return { userEnteredValue: { stringValue: v } };
              }
              return { userEnteredValue: { stringValue: ''+v } };
            })
          }
        ], // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/sheets#RowData
        fields: 'userEnteredValue', // https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/cells#CellData
        start: { sheetId, rowIndex: lineno-1, columnIndex: 0 }, // these are zero-based, but lineno is 1-based
      }
    };
    request.requests!.push(updateCellsRequest);
  }
  await (await client()).sheets.spreadsheets.batchUpdate({ spreadsheetId: id }, request);
  await cachedWorksheetNumAvailableRows({ id, worksheetName, forceUpdate: true });
  return;
}

// Given a template row with formulas in it (i.e. balances, averages, etc.), paste those columns down to the end of data in the sheet.
// Generally useful after doing a batchUpsertRows.  If you want to just give it a set of columns to paste from a particular
// lineno (i.e. a regular old cash account with just a balance), then just pass an array of all the column indexes
// that have formulas you want to paste down in limitToCols.  This is so that you don't have to put template rows in everything that you
// want to test.
export async function pasteFormulasFromTemplateRow(
  { templateLineno, limitToCols, startLineno, id, worksheetName }:
  { templateLineno: number, limitToCols?: number[], startLineno: number, id: string, worksheetName: string }
): Promise<void> {
  const sheetId = await worksheetIdFromName({ id, name: worksheetName });
  const templateresult = await (await client()).sheets.spreadsheets.values.get({
    spreadsheetId: id,
    valueRenderOption: 'FORMULA',
    range: worksheetName+'!'+templateLineno+':'+templateLineno, // Sheet!1:1 -> all of row 1 in Sheet
    majorDimension: 'ROWS',
  });
  const templaterow = templateresult.result.values?.[0];
  if (!templaterow) {
    throw new Error('ERROR: could not retrieve template row from sheet');
  }

  // Figure out last line of data:
  const sheetdata = await sheetToJson({ id, worksheetName });
  if (!sheetdata) throw new Error('ERROR: could not retrieve all values in sheet to determine last line to paste');
  const all_values = sheetdata.data;
  const endLineno = all_values.length + 1; // the +1 is for the header row

  // 1: find which columns in template to paste
  const request: gapi.client.sheets.BatchUpdateSpreadsheetRequest = { requests: [] };
  for (const [tindex, tval] of (templaterow as string[]).entries()) {
    if (typeof tval !== 'string') continue; // shouldn't ever happen
    if (tval === 'TEMPLATE') continue;
    if (!tval) continue; // empty string
    if (!tval.match(/^=/)) continue; // non-empty string, but not a formula
    if (limitToCols && !limitToCols.find(lc => lc === tindex)) continue; // formula and pasteable, but not in the limitCols

    const req: gapi.client.sheets.Request = {
      copyPaste: {
        pasteType: 'PASTE_FORMULA',
        pasteOrientation: 'NORMAL',
        source: {
          sheetId,
          startRowIndex: templateLineno - 1,
          startColumnIndex: tindex,
          endRowIndex: templateLineno, // end is exclusive
          endColumnIndex: tindex+1,    // end is exclusive
        },
        destination: {
          sheetId,
          startRowIndex: startLineno - 1,
          startColumnIndex: tindex,
          endRowIndex: endLineno, // this is 1-indexed and hence just past the end index, but this is exclusive so need 1 past the end
          endColumnIndex: tindex+1, // end is exclusive
        },
      },
    };
    request.requests!.push(req);
  }
  await (await client()).sheets.spreadsheets.batchUpdate({ spreadsheetId: id }, request);
  await cachedWorksheetNumAvailableRows({ id, worksheetName, forceUpdate: true });
}

export async function worksheetNumAvailableRows({ id, worksheetName }: { id: string, worksheetName: string }) {
  const response = await (await client()).sheets.spreadsheets.get({
    spreadsheetId: id,
    ranges: [worksheetName+'!A1'],
  });
  const num = response.result?.sheets![0]?.properties?.gridProperties?.rowCount;
  if (typeof num === 'undefined') {
    warn('FAIL: sheets.spreadsheets.get result = ', response);
    throw new Error('ERROR: failed to find num rows for worksheetName '+name+', result.status  was'+response.status+': '+response.statusText);
  }
  return num;
}

const _worksheetNameToSheetIdCache: { [name: string]: number } = {};
export async function worksheetIdFromName({ id, name, forceUpdate }: { id: string, name: string, forceUpdate?: boolean }) {
  const key = id+':'+name;
  if (forceUpdate || !_worksheetNameToSheetIdCache[key]) {
    const response = await (await client()).sheets.spreadsheets.get({
      spreadsheetId: id,
      ranges: [name+'!A1'],
    });
    const sheetId = response.result?.sheets![0]?.properties?.sheetId;
    if (!sheetId) {
      warn('FAIL: sheets.spreadsheets.get result = ', response);
      throw new Error('ERROR: failed to find sheetId for worksheetName '+name+', result.status  was'+response.status+': '+response.statusText);
    }
    _worksheetNameToSheetIdCache[key] = sheetId;
  }
  return _worksheetNameToSheetIdCache[key]!;
}


export async function getSpreadsheet(
  {id=null,path=null}:
  {id?: string | null, path?: string | null, createIfNotExist?: boolean}
): Promise<Sheets.Schema$Spreadsheet | null> {
  if (!id) {
    if (!path) {
      warn('getSpreadsheet: WARNING: you must pass either an id or a path, and you passed neight as truthy.');
      return null;
    }
    const id = (await idFromPath({path}))?.id;
    if (!id) {
      warn('getSpreadsheet: WARNING: unable to find an ID at given path: ',path);
      return null;
    }
  }
  const res = await ((await sheets()).spreadsheets.get({
    spreadsheetId: id || '',
    ranges: [],
    includeGridData: false,
  }));
  // I don't know why the type of spreadsheets.get doesn't have result on it
  // @ts-ignore
  return res?.result;
}

// You can eithre just ensure a spreadhseet file exists as a google sheet, or
// you can also ensure a worksheet exists within that spreadsheet
export async function ensureSpreadsheet({ path, worksheetName }: { path: string, worksheetName?: string }) {
  const parts = path.split('/');
  let createdSpreadsheet = false; // represents if we needed to create the spreadsheet or if it already existed
  let createdWorksheet = false;

  if (!path) {
    warn('ensureSpreadsheet: you passed an empty path.');
    return null;
  }
  const filename = parts[parts.length-1]!;
  const dirname = parts.slice(0,-1).join('/');
  trace('ensureSpreadsheet: ensuring directory',dirname,'exists');
  const dir = await ensurePath({ path: dirname});
  if (!dir) {
    warn('WARNING: ensureSpreadsheet unable to ensure parent directory of',dirname,'exists.');
    return null;
  }
  trace('ensureSpreadsheet: directory exists, listing files');

  // Grab the files in the parent directory to see if the one we want is there.
  const files = await ls(dir);
  if (!files) {
    warn('WARNING: ensureSpreadsheet unable to list contents of directory after ensuring it exists');
    return null;
  }
  trace('ensureSpreadsheet: list of files is: ', files);

  const thefile = files.contents.find(f => f.name === filename);
  if (thefile && thefile?.mimeType !== GoogleSheetsMimeType) {
    warn('WARNING: the file at',path,'already exists, but it is not a spreadsheet (',GoogleSheetsMimeType,').  It is a',thefile?.mimeType,' instead.  You need to move or delete it first.');
    return null;
  }
  let id = thefile?.id; // could still be undefined
  trace('ensureSpreadsheet: after listing files, id is', id);

  // If the file isn't there, make it.
  if (!id) {
    trace('ensureSpreadsheet: directory exists, but sheet does not.  Creating sheet at id',dir.id,' with filename',filename);
    createdSpreadsheet = true;
    if (worksheetName) createdWorksheet = true;
    const spreadsheet = await createSpreadsheet({ parentid: dir.id, name: filename, worksheetName });
    if (!spreadsheet) {
      warn('WARNING: ensureSpreadsheet unable to createSpreadsheet in parent folder',dir.id,'with filename',filename);
      return null;
    }
    id = spreadsheet.id;
    trace('ensureSpreadsheet: spreadsheet was created, id = ', id);
  }

  // Now we know we have an id for the spreadsheet and it is a Google Sheet
  // If they don't want to ensure a worksheet, we're done
  if (!worksheetName) return { id, createdSpreadsheet };

  // Otherwise, ensure the worksheet is in there too:
  let worksheetid = await worksheetIdFromName({id, name: worksheetName })
  trace('ensureSpreadsheet: after getting worksheetid for worksheetName',worksheetName,', it is', worksheetid);
  if (!worksheetid) {
    createdWorksheet = true;
    createWorksheetInSpreadsheet({ id, worksheetName });
    worksheetid = await worksheetIdFromName({ id, name: worksheetName });
    if (!worksheetid) {
      warn('WARNING: ensureSpreadsheet tried to create worksheet',worksheetName,', but it does not exist in the spreadsheet after creating it.');
      return null;
    }
  }
  await cachedWorksheetNumAvailableRows({id, worksheetName, forceUpdate: true});
  // Now we know we have both an id and a worksheetid
  return { id, worksheetid, createdSpreadsheet, createdWorksheet };
}

export type SheetJson = {
  [key: string]: any,
};
export async function sheetToJson(
  {id, worksheetName}:
  {id: string, worksheetName: string}
): Promise<{ header: string[], data: SheetJson[]} | null> {
  const allrows = await getAllRows({id, worksheetName});
  if (!allrows || !allrows.values || allrows.values.length < 1) return null;
  const header = allrows.values[0];
  if (!header) return null;
  const data = allrows.values.slice(1).map(row => {
    const ret: SheetJson = {};
    for (const [index,key] of header.entries()) {
      ret[key] = row[index]; // get the ith item from the row and place at ith key from header
    }
    return ret;
  });
  return { header, data };
}

export type SpreadsheetJson = {
  [sheetname: string]: { header: string[], data: SheetJson[] } | null,
};
export async function spreadsheetToJson(
  { id, filename }: // if you pass filename, it will check for xlsx extension and download directly from drive instead of using sheets
  { id: string, filename?: string }
  // each sheet will be at a key that is its sheetname, and it will be an array of objects
): Promise<SpreadsheetJson | null> {
  // Getting each individual sheet via Google Sheets exceeds our quota.  Grab the whole thing as an xlsx,
  // then do the sheet_to_json conversion here:

  let result: SpreadsheetJson = {};
  let wb: xlsx.WorkBook | null = null;
  if (filename?.match(/xlsx$/)) {
    // Download as regular xlsx file and make a workbook
    const arraybuffer = await getFileContents({ id });
    wb = xlsx.read(arraybuffer, { type: 'array' });
  } else {
    wb = await googleSheetToXlsxWorkbook({ id });
  }

  for (const sheetname of wb.SheetNames) {
    const sheet = wb.Sheets[sheetname]!;
    result[sheetname] = {
      header: headerFromXlsxSheet({ sheet }),
      data: xlsx.utils.sheet_to_json(sheet, { raw: false })
    };
  }
  return result;
}

export async function createSpreadsheet({
  parentid=null,
  parentpath=null,
  name,
  worksheetName=false
// either give a parentid
}: {
  parentid: string | null | false,
  parentpath?:null,
  name: string,
  worksheetName?: string | false,
// or give a parentpath
} | {
  parentid?:null,
  parentpath: string,
  name: string,
  worksheetName?: string
}): Promise<{ id: string } | null > {
  if (!parentid && parentpath) {
    const result = await ensurePath({path: parentpath});
    if (!result) {
      warn('WARNING: google.createSpreadsheet: Unable to ensurePath for parentpath = ', parentpath);
      throw new Error('Unable to ensure path for parentpath '+parentpath);
    }
    parentid = result?.id;
  }
  const fileresult = await createFile({
    parentid,
    name,
    mimeType: 'application/vnd.google-apps.spreadsheet'
  });
  if (!fileresult) return null;
  const id = fileresult.id;
  if (!worksheetName) return {id};
  // If we have a worksheetName, add a worksheet with that name
  await createWorksheetInSpreadsheet({ id, worksheetName });
  await cachedWorksheetNumAvailableRows({id, worksheetName, forceUpdate: true});
  return {id};
}

export async function createWorksheetInSpreadsheet(
  { id, worksheetName, header }:
  { id: string, worksheetName: string, header?: string[] }
): Promise<void> {
  await (await client()).sheets.spreadsheets.batchUpdate(
    { spreadsheetId: id },
    {
      requests: [
        {
          addSheet: {
            properties: {
              title: worksheetName,
              index: 0
            }
          }
        }
      ]
    }
  );
  trace('createWorksheetInSpreadsheet: worksheet created');
  if (header) {
    trace('Adding header row');
    await putRow({ id, worksheetName, row:'1', cols:header });
  }
  await cachedWorksheetNumAvailableRows({id, worksheetName, forceUpdate: true});
}

// NOTE: this function is repeated in accounts/src/node because I don't have a great
// place to put shared XLSX utilities at the moment.
export function headerFromXlsxSheet({ sheet }: { sheet: xlsx.WorkSheet }): string[] {
  const ref = sheet['!ref'];
  if (!ref) return []; // sheet is empty
  const range = xlsx.utils.decode_range(ref);
  const r = range.s.r; // start of range, row number
  const header: string[] = [];
  for (let c=range.s.c; c <= range.e.c; c++) {
    const cellref = xlsx.utils.encode_cell({c,r});
    header.push(sheet[cellref]?.w || '');
  }
  return header;
}


// colindex is zero-based, not 1-based
export async function formatColumnAsDate({ id, worksheetName, colZeroBasedIndex } : {
  id: string,
  worksheetName: string,
  colZeroBasedIndex: number,
}) {
  const sheetId = await worksheetIdFromName({ id, name: worksheetName });
  // From: https://developers.google.com/sheets/api/samples/formatting
  const formatColumnRequest : gapi.client.sheets.Request = {
    repeatCell: {
      range: {
        sheetId,
        startColumnIndex: colZeroBasedIndex,
        endColumnIndex: colZeroBasedIndex+1,     // endIndex is exclusive
      },
      cell: {
        userEnteredFormat: {
          numberFormat: {
            type: 'DATE',
            pattern: 'yyyy-MM-dd',
          },
        }
      },
      fields: 'userEnteredFormat.numberFormat',
    }
  };

  const res = await (await client()).sheets.spreadsheets.batchUpdate({ spreadsheetId: id }, { requests: [ formatColumnRequest ] });
  trace('formatColumnRequest: request was', formatColumnRequest, ', result was: ', res);
}