import { action } from 'mobx';
import {
  GPS,
  state,
  State,
  defaultHeaders,
  Field,
  assertFields,
  Source,
  assertSources,
  Driver,
  assertDrivers,
  LoadsRecord,
  assertLoadsRecords,
  FieldGeoJSON,
  LoadsRecordGeoJSON,
  LoadsRecordGeoJSONProps} from './state';
import { sheets, drive } from '@aultfarms/google';
import { FeatureCollection, Polygon, MultiPolygon, Feature, Point } from 'geojson';
import JSZip from 'jszip';
import * as toGeoJSON from '@tmcw/togeojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import debug from 'debug';

const info = debug('af/manure:info');
const warn = debug('af/manure:warn');
const error = debug('af/manure:error');

const { ensureSpreadsheet,
  spreadsheetToJson,
  batchUpsertRows,
  createWorksheetInSpreadsheet,
  putRow,
} = sheets;
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

export const loading = action('loading', (loading: boolean) => {
  state.loading = loading;
});

export const loadingError = action('loadingError', (error: string) => {
  state.loadingError = error;
  snackbarMessage(error);
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

export const mapView = action('mapView', (map: Partial<State['mapView']>) => {
  state.mapView = {
    ...state.mapView,
    ...map,
  };
  localStorage.setItem('af.manure.map', JSON.stringify(state.mapView));
  // If map GPS mode is selected, then the map center has to be curretn GPS coords:
  if (state.gpsMode === 'map') {
    // Note "true" to tell currentGPS this is not really from the browser
    currentGPS({ lat: state.mapView.center[0], lon: state.mapView.center[1] }, true);
  }
});

export const gpsMode = action('gpsMode', (gpsMode: State['gpsMode']) => {
  state.gpsMode = gpsMode;
  if (gpsMode === 'me') { // switching back to 'me' needs to re-load my coords
    currentGPS(_latestBrowserGPS, true);
  } else { // map: initialize to map center
    currentGPS({ lat: state.mapView.center[0], lon: state.mapView.center[1] }, true);
  }
});

//---------------------
// Loads
//---------------------

// Form changes:
export const load = action('load', (r: Partial<LoadsRecord>) => {
  state.load = {
    ...state.load,
    ...r,
  };
  localStorage.setItem('af.manure.loadRecord', JSON.stringify(state.load));
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
    } catch (error: any) {
      warn(`Error parsing boundary for field ${field.name}:`, error);
      return false;
    }
  });

  if (selectedField) {
    state.load.field = selectedField.name;
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
  loading(true);
  loadingError('');
  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;

  const thisYearPath = 'Ault Farms Operations/ManureRecords/'+thisYear+'_ManureRecords';
  const lastYearPath = 'Ault Farms Operations/ManureRecords/'+lastYear+'_ManureRecords';

  try {
    if (!state.sheetIds.thisYear) {
      info('There is no sheetId for this year, ensuring they exist to load them');
      // This puts id's into state.sheetIds
      await ensureManureSheets(thisYearPath, lastYearPath);
    } else {
      info('Already have a sheetId for this year, will double-check it after everything loads');
    }

    info('Loading spreadsheetToJson for id ', state.sheetIds.thisYear);
    const thisYearSheet = await spreadsheetToJson({ id: state.sheetIds.thisYear });
    info('Load this year:', thisYearSheet);
    let lastYearSheet: typeof thisYearSheet | null = null;
    info('Loading last year for id if truthy: ', state.sheetIds.lastYear);
    if (state.sheetIds.lastYear) lastYearSheet = await spreadsheetToJson({ id: state.sheetIds.lastYear});
    // Grab all the records and load into the state:
    info('This year and last year loaded.  Last year = ', lastYearSheet);
    await loadFields(thisYearSheet);
    await loadSources(thisYearSheet);
    await loadDrivers(thisYearSheet);
    await loadLoads(thisYearSheet, lastYearSheet);
    loading(false);
  } catch(e: any) {
    loadingError('Reload page.  There was an error loading spreadsheets: '+ e.message);
    info('Invalidating sheet cache in case the error needs new sheets');
    sheetIds({ thisYear: '', lastYear: '' });
    return;
  }

  // Fire off check to make sure that's still the sheetId.
  if (state.sheetIds.thisYear) {
    try {
      const { id } = await idFromPath({ path: thisYearPath });
      if ( id !== state.sheetIds.thisYear) {
        snackbarMessage('WARNING: current sheet in google has changed its id, refresh your browser')
        sheetIds({ thisYear: '', lastYear: '' });
      }
    } catch(e: any) {
      snackbarMessage('WARNING: current sheet in google has changed its id, refresh your browser')
      sheetIds({ thisYear: '', lastYear: '' });
    }
  }

  if (state.sheetIds.lastYear) {
    try {
      const { id } = await idFromPath({ path: lastYearPath });
      if ( id !== state.sheetIds.lastYear) {
        snackbarMessage('WARNING: current sheet in google has changed its id, reloading new sheet')
        sheetIds({ lastYear: '' });
        loadAllSheets(); // recursively call ourselves now that the sheet id's are cleared out
      }
    } catch(e: any) {
      snackbarMessage('WARNING: last year spreadsheet in google has changed its id, refresh your browser')
      info('No last year spreadsheet found in cached id check.');
      sheetIds({ lastYear: '' });
    };
  }

});

async function ensureManureSheets(thisYearPath: string, lastYearPath: string): Promise<void> {
  snackbarMessage('Loading spreadsheets from Google Drive');
  try {

    // Make sure this year exists:
    info('Ensuring spreadsheet for this year.');
    const thisYearInfo = await ensureSpreadsheet({ path: thisYearPath });
    info('This year spreadsheet ensured, info = ', thisYearInfo);

    // See if we have anything from last year:
    let lastYearInfo: { id: string } | null = null;
    try {
      lastYearInfo = await idFromPath({ path: lastYearPath });
      info('Found last year spreadsheet in google drive, id = ', lastYearInfo.id);
    } catch(e: any) {
      info('No last year spreadsheet found.');
    }
    info('Last year spreadsheet idFromPath returned: ', lastYearInfo);

    if (!thisYearInfo) {
      throw new Error('Failed to check spreadsheets in Google Drive');
    }
    const { id, createdSpreadsheet } = thisYearInfo;

    const newSheetIds = {
      thisYear: id,
      lastYear: lastYearInfo?.id || '',
    }
    sheetIds(newSheetIds);

    // If the sheet was created, populate it either from original lastYear,
    // or just initialize headers on empty sheets
    if (createdSpreadsheet) {
      // Grab last year as template if it exists:
      const lastYearData = (lastYearInfo && lastYearInfo.id) ? await spreadsheetToJson({ id: lastYearInfo.id }) : null;
      info('lastYearData = ', lastYearData);

      // Create and populate metadata sheets:
      for (const worksheetName of (['fields','sources', 'drivers', 'loads'] as (keyof typeof defaultHeaders)[])) {
        info('Creating worksheet ', worksheetName);
        const json = lastYearData?.[worksheetName];
        const header = json?.header || defaultHeaders[worksheetName];
        const rows = json?.data.map((f, index) => ({ ...f, lineno: index+2 }));
        await createWorksheetInSpreadsheet({ id, worksheetName });
        // loads sheet is never copied from year to year
        if (worksheetName !== 'loads' && json && json.header.length > 0 && rows) {
          info('Have previous year data for template, batchUpserting it for worksheet ', worksheetName);
          await batchUpsertRows({ id, worksheetName, rows, header, insertOrUpdate: 'UPDATE' });
        } else {
          info('Have no previous year data, putting headers for worksheet ', worksheetName);
          await putRow({ id, worksheetName, row: '1', cols: header });
        }
      }
      info('All worksheets created in new spreadsheet successfully');
    }
  } catch(e: any) {
    snackbarMessage('Error loading spreadsheets from Google Drive:'+ e.message);
    error('ERROR: ensureManureSheets: failed to ensure sheets.  Error was: ', e);
  }
}

// Helper function to populate lineno on all arrays
function addLineno(a: any[]) {
  for (const [index, obj] of a.entries()) {
    obj['lineno'] = index+2;
  }
}

//------------------------------------------
// Fields
//------------------------------------------

export const fields = action('fields', (fields: Field[]) => {
  state.fields = fields;
  // Squash all fields into single geojson for rendering
  const geojson: FieldGeoJSON = {
    type: 'FeatureCollection',
    features: fields.map(field => ({
      ...field.boundary,
      properties: { name: field.name },
    })),
  };
  geojsonFields(geojson);
});
let _geojsonFields: FeatureCollection<Polygon | MultiPolygon> = { type : 'FeatureCollection', features: [] };
export const geojsonFields = action('geojsonFields', (gflds?: FeatureCollection<Polygon | MultiPolygon>) => {
  if (gflds) {
    _geojsonFields = gflds;
    state.geojsonFields.rev++;
  }
  return _geojsonFields;
})
export const loadFields = action('loadFields', async (thisYearSheet: any) => {
  const flds = thisYearSheet?.fields || { header: [], data: [] };
  if (!Array.isArray(flds.data)) throw new Error('fields sheet is not an array');
  addLineno(flds.data);
  assertFields(flds.data);
  fields(flds.data);
});

//-----------------------------
// Sources
//-----------------------------

// If google sheets returns numbers, they are strings.  Handy function
// to just sanitize things to be numbers if they look like numbers
function stringsToNumbers(arr: any[]) {
  for (const obj of arr) {
    if (typeof obj !== 'object') continue;
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val ==='string' && val.match(/^[\-\.0-9]+$/)) {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          obj[key] = num;
        }
      }
    }
  }
}

export const sources = action('sources', (sources: Source[]) => {
  state.sources = sources;
});
export const loadSources = action('loadSources', async (thisYearSheet: any) => {
  const srcs = thisYearSheet?.sources || {  header: [], data: [] };
  if (!Array.isArray(srcs.data)) throw new Error('sources sheet is not an array');
  // have to turn the acPerLoad into numbers
  addLineno(srcs.data);
  stringsToNumbers(srcs.data);
  assertSources(srcs.data);
  sources(srcs.data);
});

//--------------------------------
// Drivers
//--------------------------------

export const drivers = action('drivers', (drivers: Driver[]) => {
  state.drivers = drivers;
});
export const loadDrivers = action('loadDrivers', async (thisYearSheet: any) => {
  const drs = thisYearSheet?.drivers || {  header: [], data: [] };
  if (!Array.isArray(drs.data)) throw new Error('drivers sheet is not an array');
  addLineno(drs.data);
  assertDrivers(drs.data);
  drivers(drs.data);
});

//-----------------------------
// LoadsRecords
//-----------------------------

export const loads = action('loads', (loadsRecords: LoadsRecord[]) => {
  state.loads = loadsRecords;
  // Squash all loads GPS points into a single geojson for rendering
  const allFeatures: Feature<Point, LoadsRecordGeoJSONProps>[] = [];
  for (const load of loadsRecords) {
    const { geojson, ...rest } = load;
    for (const feature of geojson.features) {
      allFeatures.push({
        ...feature,
        properties: rest, // every point gets all the props from the loadsRecord
      });
    }
  }
  const geojson: LoadsRecordGeoJSON = {
    type: 'FeatureCollection',
    features: allFeatures,
  };
  geojsonLoads(geojson);
});
let _geojsonLoads: FeatureCollection<Point, LoadsRecordGeoJSONProps> = { type : 'FeatureCollection', features: [] };
export const geojsonLoads = action('geojsonLoads', (glds?: FeatureCollection<Point, LoadsRecordGeoJSONProps>) => {
  if (glds) {
    _geojsonLoads = glds;
    state.geojsonLoads.rev++;
  }
  return _geojsonLoads;
});
export const loadLoads = action('loadLoads', async (thisYearSheet: any, lastYearSheet: any) => {
  const thisYearLoads = thisYearSheet?.loads || {  header: [], data: [] };
  const lastYearLoads = lastYearSheet?.loads || {  header: [], data: [] };
  const lds = [ ...thisYearLoads.data,...lastYearLoads.data ];
  addLineno(lds);
  assertLoadsRecords(lds);
  loads(lds);
});