import type * as google from '../';
import debug from 'debug';
import deepequal from 'deep-equal';
import { validateRowObject, checkUpsertResultAgainstExpected, pathroot } from './util';

const info = debug('test/google:info');

type Google = typeof google;

export default async function sheets(g: Google) {
  info('sheets: starting');
  const path = `${pathroot}/SHEETS1`;
  const folder = await g.drive.ensurePath({path});
  if (!folder) throw `ensurePath did not return an id for the SHEETS1 folder`;
  const worksheetName = 'testsheet2';

  info('sheets: createSpreadsheet w/o worksheetName');
  const r2 = await g.sheets.createSpreadsheet({
    parentid: folder.id,
    name: 'testwb1',
  });
  if (!r2?.id) throw `createSpreadsheet returned null instead of an id when creating spreadsheet without worksheetName`;
  const sheet1 = await g.sheets.getSpreadsheet({ id: r2.id });
  if (!sheet1 || !sheet1?.sheets) throw `createSpreadsheet failed to getSpreadsheet when creating without worksheetName`;
  if (sheet1?.sheets?.length < 1) throw `createSpreadsheet failed to create a spreadsheet with at least one sheet in it`;

  info('sheets: createSpreadsheet w/ worksheetName');
  const r3 = await g.sheets.createSpreadsheet({
    parentid: folder.id,
    name: 'testwb2',
    worksheetName,
  });
  if (!r3?.id) throw `createSpreadsheet returned null instead of an id when creating spreadsheet with worksheetName`;
  let id = r3.id; // keep for later tests
  const sheet2 = await g.sheets.getSpreadsheet({ id: r3.id });
  if (!sheet2 || !sheet2.sheets) throw `createSpreadsheet failed to getSpreadsheet after creating with a worksheetName`;
  if (!sheet2.sheets.find((s) => s?.properties?.title === 'testsheet2')) {
    throw `createSpreadsheet failed to set worksheetName to testsheet2, sheet names are ${sheet2.sheets.map(s => s?.properties?.title).join(',')}`;
  }

  info(`sheets: putRow`);
  const cols = [ 'first col', 'second col', 'third col' ];
  const r4 = await g.sheets.putRow({
    id,
    worksheetName,
    row: '1',
    cols,
  });
  if (!r4 || !deepequal(r4,cols)) throw `putRow failed to return updated values (${r4}) equal to passed values (${cols})`;
  const allrows = await g.sheets.getAllRows({ id, worksheetName });
  if (!deepequal(cols, allrows?.values?.[0])) {
    throw `putRow failed to put the given row to the spreadsheet: values in sheet (${allrows?.values}) are not equal to cols (${cols})`;
  }

  info('sheets: testing putRow on line 1001 (beyond existing rows)')
  const r4a = await g.sheets.putRow({ id, worksheetName, row: '1001', cols, rawVsUser: 'USER_ENTERED' });
  if (!r4a || !deepequal(r4a,cols)) throw `putRow failed to return updated values (${JSON.stringify(r4)}) equal to passed values (${JSON.stringify(cols)})`

  info(`sheets: spreadsheetToJson`);
  let header = [ 'key1', 'key2', 'key3' ];
  const rows = [ [ 'val1-1', 'val1-2', 'val1-3' ],
                 [ 'val2-1', 'val2-2', 'val2-3' ],
                 [ 'val3-1', 'val3-2', 'val3-3' ] ];
  await g.sheets.putRow({
    id, worksheetName,
    row: '1',
    cols: header,
  });
  for (const [i, row] of rows.entries()) {
    await g.sheets.putRow({
      id, worksheetName,
      row: ''+(i+2),
      cols: row
    });
  }
  const json = await g.sheets.spreadsheetToJson({ id });
  if (!json) throw `sheets.spreadsheetToJson returned falsey (${json})`;
  const sheet = json[worksheetName];
  if (!sheet) throw `sheets.spreadsheetToJson did not have the worksheetName (${worksheetName}) key in it (${Object.keys(json)})`;
  for (const [index, h] of header.entries()) {
    if (sheet.header[index] !== h) {
      throw `sheets.spreadsheetToJson: the returned header as index ${index} (${sheet.header[index]}) is not the same as the original header (${h}).`;
    }
  }
  for (const [rownum,row] of rows.entries()) {
    const retrow = sheet.data[rownum];
    for (const [colnum,key] of header.entries()) {
      if (retrow?.[key] !== row[colnum]) {
        throw `sheets.spreadsheetToJson: row ${rownum} of returned json did not have value at ${key} (${retrow?.[key]}): should have been value ${row[colnum]}`;
      }
    }
  }

  info(`sheets: googleSheetToXlsxWorkbook`);
  const wb = await g.sheets.googleSheetToXlsxWorkbook({ id });
  if (!wb?.Sheets[worksheetName]) {
    throw `sheets.googleSheetToXlsxWorkbook: failed to retrive a workbook, workbook should have contained sheet ${worksheetName}`;
  }

  info(`sheets: arrayToLetterRange`);
  const str = g.sheets.arrayToLetterRange("1", cols);
  if (str !== 'A1:C1') throw `arrayToLetterRange: created range string (${str}) is not what was expected ('A1:C1')`;


  //------------------------------------------------------------------
  // Batch Upsert

  info(`sheets: batchUpsertRows -> overwrite a block of 10 rows`);
  const r5 = await g.sheets.createSpreadsheet({
    parentid: folder.id,
    name: 'testBatchInsertRows',
    worksheetName,
  });
  if (!r5?.id) throw `createSpreadsheet returned null instead of an id when creating spreadsheet with worksheetName`;
  id = r5.id;
  header = [];
  for (let i=0; i < 5; i++) {
    header.push(`col${i}`);
  }
  // Put header in first row
  await g.sheets.putRow({ id, row: '1', cols: header, worksheetName });
  let rowobjects: google.sheets.RowObject[] = [];
  for (let i=0; i < 10; i++) {
    const rowobj: google.sheets.RowObject = { lineno: i+2 }; // plus 1 accounts for header, and +2 accounts for 1-based row indexing
    for(let j=0; j < 5; j++) {
      rowobj[`col${j}`] = `row${i}col${j}`;
    }
    rowobjects.push(rowobj);
  }
  await g.sheets.batchUpsertRows({ id, worksheetName, header,
    rows: rowobjects,
    insertOrUpdate: 'UPDATE',
  });
  await checkUpsertResultAgainstExpected({ expected: rowobjects, id, worksheetName, g });


  info(`sheets: batchUpsertRows -> update row 3 values`)
  for (let i=0; i < 5; i++) {
    rowobjects[2]![`col${i}`] += '-UPDATED';
  }
  await g.sheets.batchUpsertRows({ id, worksheetName, header,
    rows: rowobjects,
    insertOrUpdate: 'UPDATE'
  });
  await checkUpsertResultAgainstExpected({ expected: rowobjects, id, worksheetName, g });

  info(`sheets: batchUpsertRows -> insert 3 rows into existing rows`);
  const rowobjectsToAdd: google.sheets.RowObject[] = [
    // first lineno 3 will end up at line 3, and orig line 3 will be pushed down to line 4
    { lineno: 3, col0: 'INSERTEDrow3col0', col1: 'INSERTEDrow3col1', col2: 'INSERTEDrow3col2', col3: 'INSERTEDrow3col3', col4: 'INSERTEDrow3col4'},
    // second lineno 3 will end up at line 4, and orig line 3 will be pushed down again to line 5
    { lineno: 3, col0: 'INSERTEDrow4col0', col1: 'INSERTEDrow4col1', col2: 'INSERTEDrow4col2', col3: 'INSERTEDrow4col3', col4: 'INSERTEDrow4col4'},
    // lineno 7 will end up inserting as line 9 since we just pushed the orig line 7 down to 9
    { lineno: 7, col0: 'INSERTEDrow9col0', col1: 'INSERTEDrow9col1', col2: 'INSERTEDrow9col2', col3: 'INSERTEDrow9col3', col4: 'INSERTEDrow9col4'},
  ];
  const newrowobjects: google.sheets.RowObject[] = [
    rowobjects[0]!,
    rowobjectsToAdd[0]!, // lineno 3 is actually only the second object b/c of 1-indexing and the header row in spot 1
    rowobjectsToAdd[1]!,
    rowobjects[1]!,
    rowobjects[2]!,
    rowobjects[3]!,
    rowobjects[4]!,
    rowobjectsToAdd[2]!, // lineno 7 (header and 1-based indexing)
    rowobjects[5]!,
    rowobjects[6]!,
    rowobjects[7]!,
    rowobjects[8]!,
    rowobjects[9]!,
  ];
  await g.sheets.batchUpsertRows({ id, worksheetName, header,
    rows: rowobjectsToAdd,
    insertOrUpdate: 'INSERT'
  });
  await checkUpsertResultAgainstExpected({ expected: newrowobjects, id, worksheetName, g });


  info(`sheets: pasteFormulasFromTemplateRow AND formatColumnAsDate`);

  const r6 = await g.sheets.createSpreadsheet({
    parentid: folder.id,
    name: 'testPasteFormulas',
    worksheetName,
  });
  if (!r6?.id) throw `createSpreadsheet returned null instead of an id when creating spreadsheet with worksheetName`;
  id = r6.id;
  header = [
    'date',
    'description',
    'amount',
    'balance',
    'qty',
    'qtyBalance',
    'ave'
  ];
  await g.sheets.putRow({ id, worksheetName, row: '1', cols: header, rawVsUser: 'USER_ENTERED' });
  rowobjects = [
    { lineno: 2, date: 'SETTINGS', description: '', amount: '', balance: '', qty: '', qtyBalance: '', ave: '' },
    { lineno: 3, date: 'TEMPLATE', description: '', amount: '', balance: '=C3+D2', qty: '', qtyBalance: '=E3+F2', ave: '=D3/F3' },
    { lineno: 4, date: '2022-01-01', description: 'row 1', amount: 0, balance: 0, qty: 0, qtyBalance: 0 },
    { lineno: 5, date: '2022-01-02', description: 'row 2', amount: 10, balance: 0, qty: 1, qtyBalance: 0 },
    { lineno: 6, date: '2022-01-03', description: 'row 3', amount: 5, balance: 0, qty: 2, qtyBalance: 0 },
    { lineno: 7, date: '2022-01-04', description: 'row 4', amount: 7, balance: 0, qty: 9, qtyBalance: 0 },
  ];
  await g.sheets.batchUpsertRows({ id, worksheetName, rows: rowobjects, header, insertOrUpdate: 'UPDATE' });

  info('sheets: formatColumnAsDate');
  await g.sheets.formatColumnAsDate({ id, worksheetName, colZeroBasedIndex: 0 });
  const r7a = await g.sheets.sheetToJson({ id, worksheetName });
  if (!r7a) throw `ERROR: sheetToJson returned nothing`;
  const firstrow = r7a.data[2];
  if (!firstrow || typeof firstrow.date !== 'string') throw `ERROR: first data row (row lineno 4) has no date at all`;
  const expecteddate = rowobjects[2]!.date;
  if (firstrow.date !== expecteddate) throw `ERROR: first data row date (${firstrow.date}) is not the same as the date we put in there (${expecteddate}).  Entire row in spreadsheet is: (${JSON.stringify(firstrow)}) formatColumnAsDate did not work.`;


  info(`sheets: pasteFormulasFromTemplateRow`);
  await g.sheets.pasteFormulasFromTemplateRow({ id, worksheetName,
    templateLineno: 3,
    startLineno: 4,
  });

  const r7 = await g.sheets.sheetToJson({ id, worksheetName });
  if (!r7) throw `ERROR: sheetToJson returned nothing`;
  const lastrow = r7.data[5];
  const settingsrow = r7.data[0];
  validateRowObject({ result: lastrow, expected: {
    ...rowobjects[rowobjects.length-1]!,
    balance: 22,
    qtyBalance: 12,
    ave: (22 / 12),
  }});
  validateRowObject({ result: settingsrow, expected: {
    date: 'SETTINGS'
  }});

  info('sheets: ensureSpreadsheet without worksheetName and sheet does not exist');
  let ensureSpreadsheetPath = `${path}/test_ensure1`;
  const r8 = await g.sheets.ensureSpreadsheet({ path: ensureSpreadsheetPath });
  if (!r8?.id) throw `ERROR: ensureSpreadsheet failed to return an id`;
  if (!r8.createdSpreadsheet) throw `ERROR: ensureSpreadsheet created spreadsheet, but createdSpreadsheet was falsey`;
  info('the first ensureSpreadsheet returned',r8);
  const r9 = await g.sheets.getSpreadsheet({ id: r8.id });
  info('the first getSpreadsheet returned',r9);
  if (!r9?.spreadsheetId) throw `ERROR: could not retrieve ensured spreadsheet`;

  info('sheets: ensureSpreadsheet without worksheetName and sheet already exists');
  const r10 = await g.sheets.ensureSpreadsheet( { path: ensureSpreadsheetPath });
  if (!r10) throw `ERROR: ensureSpreadsheet returned null`;
  if (r10.createdSpreadsheet) throw `ERROR: ensureSpreadsheet did not create spreadsheet because it already existed, but createdSpreadsheet was truthy`;
  if (r10.id !== r8?.id) throw `ERROR: after second ensureSpreadsheet on the same path, did not get same id back.`;

  info('sheets: ensureSpreadsheet with worksheetName and folder to create');
  ensureSpreadsheetPath = `${path}/newfolder/test_ensure2`;
  const r11 = await g.sheets.ensureSpreadsheet({ path: ensureSpreadsheetPath, worksheetName });
  if (!r11) throw `ERROR: ensureSpreadsheet with worksheetName returned null`;
  if (!r11.createdSpreadsheet) throw `ERROR: ensureSpreadsheet with worksheetName did not return truthy createdSpreadsheet`;
  if (!r11.createdWorksheet) throw `ERROR: ensureSpreadsheet with worksheetName did not return truthy createdWorksheet.  worksheetName = ${worksheetName}, r11 = ${JSON.stringify(r11)}`;
  if (!r11?.id) throw `ERROR: ensureSpreadsheet with worksheetName did not return an id`;
  if (!r11?.worksheetid) throw `ERROR: ensureSpreadsheet with worksheetName did not return a worksheetid`;
  const r12 = await g.sheets.getSpreadsheet({ id: r11.id });
  if (!r12?.spreadsheetId) throw `ERROR: could not retrieve ensured spreadsheet with worksheetName`;
  const r13 = await g.sheets.worksheetIdFromName({ id: r11.id, name: worksheetName });
  if (!r13 || r13 !== r11.worksheetid) throw `ERROR: worksheetid after ensuring is not the same as the one returned from ensureSpreadsheet with worksheetName`;

  info(`sheets: ensureSpreadsheet with worksheetName when it already exists`);
  const r14 = await g.sheets.ensureSpreadsheet({ path: ensureSpreadsheetPath, worksheetName });
  if (r14?.id !== r11.id) throw `ERROR: second call to ensureSpreadsheet with worksheetName did NOT return same id as the first.`;
  if (r14?.worksheetid !== r11.worksheetid) throw `ERROR: second call to ensureSpreadsheet with worksheetName did NOT return same worksheetid as the first.`;

  info(`sheets: createWorksheetInSpreadsheet with a header`);
  await g.sheets.createWorksheetInSpreadsheet({ id: r14.id, worksheetName: 'newworksheet', header });
  const r15 = await g.sheets.sheetToJson({ id: r14.id, worksheetName: 'newworksheet' });
  if (!r15) throw `ERROR: sheetToJson returned nothing`;
  if (r15.header.join(',')!== header.join(',')) throw `ERROR: header from createWorksheetInSpreadsheet did not create a sheet with the proper header`;

  info(`sheets: all tests passed`);
}