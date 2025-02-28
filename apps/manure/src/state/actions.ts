import { action, runInAction } from 'mobx';
import { LoadRecord, GPS, state } from './state';
import { sheets, drive } from '@aultfarms/google';
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';
import debug from 'debug';
import { getCurrentGPSFromBrowser } from '../util';

const info = debug('af/manure:info');
const warn = debug('af/manure:warn');
const { ensureSpreadsheet,
  spreadsheetToJson,
  batchUpsertRows,
  sheetToJson, } = sheets;
const { idFromPath } = drive;

/*

// Define the structure of the sheet data
type SheetData = {
  records: { date: string; field: string; source: string; loads: number }[];
  fields: { name: string; boundary: string }[];
  sources: { name: string }[];
  drivers: { name: string }[];
};

export const verifyAndUpdateSpreadsheets = action('verifyAndUpdateSpreadsheets', async () => {
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;

  const currentPath = `Ault Farms Operations/ManureRecords/${currentYear}_ManureRecords`;
  const previousPath = `Ault Farms Operations/ManureRecords/${previousYear}_ManureRecords`;

  // Ensure current year's spreadsheet
  let currentSpreadsheetId = state.currentSheetId;
  if (!currentSpreadsheetId) {
    currentSpreadsheetId = await ensureCurrentYearSpreadsheet(currentYear, previousYear);
    runInAction(() => {
      state.currentSheetId = currentSpreadsheetId;
      localStorage.setItem('currentSheetId', currentSpreadsheetId);
    });
  }

  // Ensure previous year's spreadsheet
  let lastYearSpreadsheetId = state.lastYearSheetId;
  if (!lastYearSpreadsheetId) {
    lastYearSpreadsheetId = await idFromPath({ path: previousPath });
    if (lastYearSpreadsheetId) {
      runInAction(() => {
        state.lastYearSheetId = lastYearSpreadsheetId;
        localStorage.setItem('lastYearSheetId', lastYearSpreadsheetId);
      });
    }
  }

  // Load data into state for current year
  if (currentSpreadsheetId) {
    const currentData = await spreadsheetToJson({ id: currentSpreadsheetId });
    runInAction(() => {
      state.currentSheet = {
        records: currentData.records?.data || [],
        fields: currentData.fields?.data || [],
        sources: currentData.sources?.data || [],
        drivers: currentData.drivers?.data || [],
      };
    });
  }

  // Load data into state for previous year
  if (lastYearSpreadsheetId) {
    const lastYearData = await spreadsheetToJson({ id: lastYearSpreadsheetId });
    runInAction(() => {
      state.lastYearSheet = {
        records: lastYearData.records?.data || [],
        fields: lastYearData.fields?.data || [],
        sources: lastYearData.sources?.data || [],
        drivers: lastYearData.drivers?.data || [],
      };
    });
  }
});


export const setSelection = action('setSelection', (key: 'selectedField' | 'selectedSource' | 'selectedDriver', value: string | null) => {
  state[key] = value;
  if (value) localStorage.setItem(key, value);
});

export const setDate = action('setDate', (date: string) => {
  state.selectedDate = date;
});

export const uploadKMZ = action('uploadKMZ', async (file: File) => {
  try {
    const currentSheet = await sheetToJson({
      id: state.currentSheetId,
      worksheetName: 'fields',
    });
    if (!currentSheet) throw new Error('Failed to retrieve fields sheet');

    const header = currentSheet.header;
    const existingFields = currentSheet.data.map((row, index) => ({
      ...row,
      lineno: index + 2,
    }));

    const newFields = await parseKMZ(file);
    const updates: any[] = [];
    const inserts: any[] = [];
    let nextLineno = existingFields.length + 2;
    const existingFieldMap = new Map(existingFields.map(f => [f.name, f]));

    for (const newField of newFields) {
      const existing = existingFieldMap.get(newField.name);
      if (existing) {
        updates.push({
          lineno: existing.lineno,
          name: newField.name,
          boundary: newField.boundary,
        });
      } else {
        inserts.push({
          lineno: nextLineno,
          name: newField.name,
          boundary: newField.boundary,
        });
        nextLineno++;
      }
    }

    if (updates.length > 0) {
      await batchUpsertRows({
        id: state.currentSheetId,
        worksheetName: 'fields',
        rows: updates,
        header,
        insertOrUpdate: 'UPDATE',
      });
    }

    if (inserts.length > 0) {
      await batchUpsertRows({
        id: state.currentSheetId,
        worksheetName: 'fields',
        rows: inserts,
        header,
        insertOrUpdate: 'INSERT',
      });
    }

    runInAction(() => {
      for (const update of updates) {
        const field = state.currentSheet.fields.find(f => f.name === update.name);
        if (field) field.boundary = update.boundary as string;
      }
      for (const insert of inserts) {
        state.currentSheet.fields.push({
          name: insert.name as string,
          boundary: insert.boundary as string,
        });
      }
      state.isConfigModalOpen = false;
    });

  } catch (error) {
    console.error('Error uploading KMZ:', error);
  }
});

export async function parseKMZ(file: File): Promise<{ name: string; boundary: string }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
  if (!kmlFile) throw new Error('No KML file found in KMZ');
  const kmlText = await kmlFile.async('text');
  const parser = new DOMParser();
  const kmlDom = parser.parseFromString(kmlText, 'text/xml');
  const geoJson = toGeoJSON.kml(kmlDom);
  return geoJson.features
    .filter(feature => feature.geometry?.type === 'Polygon')
    .map(feature => ({
      name: feature.properties?.name || 'Unnamed Field',
      boundary: JSON.stringify(feature.geometry),
    }));
}

async function ensureCurrentYearSpreadsheet(currentYear: number, previousYear: number): Promise<string> {
  const currentPath = `Ault Farms Operations/ManureRecords/${currentYear}_ManureRecords`;
  const previousPath = `Ault Farms Operations/ManureRecords/${previousYear}_ManureRecords`;

  let currentSpreadsheetId = await idFromPath({ path: currentPath });
  if (!currentSpreadsheetId) {
    currentSpreadsheetId = (await ensureSpreadsheet({ path: currentPath })).id;

    const previousSpreadsheetId = await idFromPath({ path: previousPath });
    if (previousSpreadsheetId) {
      const previousData = await spreadsheetToJson({ id: previousSpreadsheetId });
      const sheetsToCopy = ['fields', 'sources', 'drivers'];
      for (const sheetName of sheetsToCopy) {
        const sheetData = previousData[sheetName];
        if (sheetData) {
          const header = sheetData.header;
          const rows = sheetData.data.map((row, index) => ({ lineno: index + 2, ...row }));
          await batchUpsertRows({
            id: currentSpreadsheetId,
            worksheetName: sheetName,
            rows,
            header,
            insertOrUpdate: 'INSERT',
          });
        }
      }
      const recordsHeader = ['date', 'field', 'source', 'loads'];
      await batchUpsertRows({
        id: currentSpreadsheetId,
        worksheetName: 'records',
        rows: [],
        header: recordsHeader,
        insertOrUpdate: 'INSERT',
      });
    } else {
      const defaultSheets = {
        records: ['date', 'field', 'source', 'loads'],
        fields: ['name', 'boundary'],
        sources: ['name', 'type', 'max ac/load'],
        drivers: ['name'],
      };
      for (const [sheetName, header] of Object.entries(defaultSheets)) {
        await batchUpsertRows({
          id: currentSpreadsheetId,
          worksheetName: sheetName,
          rows: [],
          header,
          insertOrUpdate: 'INSERT',
        });
      }
    }
  }
  return currentSpreadsheetId;
}

export const recordLoad = action('recordLoad', async () => {
  if (!state.selectedField || !state.selectedSource || !state.selectedDriver) {
    warn('Missing selection for recording load');
    return;
  }
  // Grab the GPS coordinates from the browser
  let coords = { lat: 0, lon: 0 };
  try {
    const curcoords = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });
    coords = {
      lat: curcoords.coords.latitude,
      lon: curcoords.coords.longitude,
    };
  } catch(e: any) {
    info('Failed to get GPS coordinates, error was: ', e);
    info('Using 0,0 as coordinates instead');
  }
  let todayRecord = state.records.find(record =>
    record.date === state.selectedDate
    && record.field === state.selectedField
    && record.source === state.selectedSource
    && record.driver === state.selectedDriver
  );
  if (!todayRecord) {
    todayRecord = {
      date: state.selectedDate,
      field: state.selectedField,
      source: state.selectedSource,
      loads: 1,
      driver: state.selectedDriver,
      geojson: { type: 'FeatureCollection', features: [] },
    };
    state.currentSheet.records.push(newRecord);
  }

  const header = ['date', 'field', 'source', 'loads'];
  const rows = state.currentSheet.records.map(record => ({
    lineno: state.currentSheet.records.indexOf(record) + 2,
    ...record,
  }));
  await batchUpsertRows({
    id: state.currentSheetId!,
    worksheetName: 'records',
    rows,
    header,
    insertOrUpdate: 'INSERT',
  });
  info('Load recorded:', newRecord);
});

*/

//-----------------------------------------------------
// Things reviewed and verified by Aaron
//-----------------------------------------------------

//----------------------
// View
//----------------------

export const toggleConfigModal = action('toggleConfigModal', () => {
  state.config.modalOpen = !state.config.modalOpen;
});

//---------------------
// GPS
//---------------------

export const updateCurrentGPS = action('updateCurrentGPS', async () => {
  const coords = await getCurrentGPSFromBrowser();
  runInAction(() => state.currentGPS = coords);
});

//---------------------
// Loads
//---------------------

// Form changes:
export const record = action('record', (r: Partial<LoadRecord>) => {
  state.record = {
    ...state.record,
    ...r,
  };
  localStorage.setItem('af.manure.loadRecord', JSON.stringify(state.record));
});