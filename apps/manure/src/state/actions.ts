import { action, runInAction } from 'mobx';
import { GPS, LoadRecord, state, State } from './state';
import { sheets, drive } from '@aultfarms/google';
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
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

export const snackbarMessage = action('snackbarMessage', (message: string) => {
  state.snackbar.open = true;
  state.snackbar.message = message;
  info('Snackbar: ', message);
});
export const closeSnackbar = action('closeSnackbar', () => {
  state.snackbar.open = false;
});

//---------------------
// GPS and Map
//---------------------

let _latestBrowserGPS : GPS = { lat: 0, lon: 0 };
export const currentGPS = action('currentGPS', async (coords: GPS, notReallyFromBrowser?: boolean) => {
  state.currentGPS = coords;
  if (!notReallyFromBrowser) {
    _latestBrowserGPS = { ...coords };
  }
});

export const map = action('map', (map: Partial<State['map']>) => {
  state.map = {
    ...state.map,
    ...map,
  };
  localStorage.setItem('af.manure.map', JSON.stringify(state.map));
  // If map GPS mode is selected, then the map center has to be curretn GPS coords:
  if (state.gpsMode === 'map') {
    // Note "true" to tell currentGPS this is not really from the browser
    currentGPS({ lat: state.map.center[0], lon: state.map.center[1] }, true);
  }
});

export const gpsMode = action('gpsMode', (gpsMode: State['gpsMode']) => {
  state.gpsMode = gpsMode;
  if (gpsMode === 'me') { // switching back to 'me' needs to re-load my coords
    currentGPS(_latestBrowserGPS, true);
  } else { // map: initialize to map center
    currentGPS({ lat: state.map.center[0], lon: state.map.center[1] }, true);
  }
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

//---------------------
// Fields
//---------------------

export const autoselectField = action(() => {
  const { lat, lon } = state.currentGPS;
  if (!lat || !lon) {
    warn('No current GPS coordinates available');
    return;
  }

  // Create a Turf.js point from currentGPS
  const gpsPoint = point([lon, lat]); // Turf expects [lng, lat]

  // Find the field containing the point
  const selectedField = state.fields.find((field) => {
    try {
      return booleanPointInPolygon(gpsPoint, field.boundary);
    } catch (error) {
      warn(`Error parsing boundary for field ${field.name}:`, error);
      return false;
    }
  });

  if (selectedField) {
    state.record.field = selectedField.name;
  } else {
    snackbarMessage('No field found containing current GPS coordinates');
  }
});


//----------------------------------
// Spreadsheets
//----------------------------------

export const sheetIds = action('sheetIds', (sheetIds: Partial<State['sheetIds']>) => {
  state.sheetIds = {
    ...state.sheetIds,
    ...sheetIds,
  };
  localStorage.setItem('af.manure.sheetIds', JSON.stringify(state.sheetIds));
  // Note: this does not trigger a full reload of everything, you have to call that yourself.
});

export const loadAllSheets = action('loadAllSheets', async () => {
  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;

  const thisYearPath = 'Ault Farms Operations/ManureRecords/'+thisYear+'_ManureRecords';
  const lastYearPath = 'Ault Farms Operations/ManureRecords/'+lastYear+'_ManureRecords';

  if (!state.sheetIds.thisYear) {
    // This puts id's into state.sheetIds
    await ensureManureSheets(thisYearPath, lastYearPath);
  } else {
    // Otherwise, continue on with loading that sheet, but fire off this async
    // check to make sure that's still the sheet:
    idFromPath({ path: thisYearPath }).then(({ id }) => {
      if ( id !== state.sheetIds.thisYear) {
        snackbarMessage('WARNING: current sheet in google has changed its id, reloading new sheet')
        sheetIds({ thisYear: '', lastYear: '' });
        loadAllSheets(); // recursively call ourselves now that the sheet id's are cleared out
      }
    });
  }

  const thisYearSheet = await spreadsheetToJson({ id: state.sheetIds.thisYear });
  let lastYearSheet: typeof thisYearSheet | null = null;
  if (state.sheetIds.lastYear) lastYearSheet = await spreadsheetToJson({ id: state.sheetIds.lastYear});
  // Grab all the records and load into the state:
  await loadFields(thisYearSheet, lastYearSheet);
  await loadSources(thisYearSheet, lastYearSheet);
  await loadDrivers(thisYearSheet, lastYearSheet);
  await loadRecords(thisYearSheet, lastYearSheet);
});

async function ensureManureSheets(thisYearPath: string, lastYearPath: number): Promise<string> {


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