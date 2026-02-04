import { action, runInAction } from 'mobx';
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
import bbox from '@turf/bbox';
import center from '@turf/center';
import { point } from '@turf/helpers';
import debug from 'debug';
import { RowObject } from '@aultfarms/google/dist/sheets';

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

export const uploadKMZ = action('uploadKMZ', async (file: File) => {
  const newFields = await parseKMZIntoFields(file);
  const stateFields = JSON.parse(JSON.stringify(state.fields)) as Field[];
  for (const field of newFields) {
    const existing = stateFields.find(f => f.name === field.name);
    if (existing) {
      existing.name = field.name;
      existing.boundary = field.boundary;
    } else {
      stateFields.push(field);
    }
    fieldsChanged(true); // user has to press save button to push to spreadsheet
    fields(stateFields);
  }
});

export const fieldsChanged = action('fieldsChanged', (val: boolean) => {
  state.fieldsChanged = val;
});

export const saveFields = action('saveFields', async () => {
  loading(true);
  await upsertAllFields(); // fieldsChanged is updated by the loadAllSheets in this function
  loading(false);
});

export const upsertAllFields = action('upsertAllFields', async () => {
  try {
    const fields = state.fields;
    const header = defaultHeaders.fields;
    const rows: RowObject[] = [];
    // Note: the "1" is to preserve the header in an otherwise empty sheet
    let next_lineno = state.fields.reduce((max,f) => Math.max(max, f.lineno || 1), 1) + 1;

    for (const field of fields) {
      const row = {
        lineno: field.lineno || next_lineno++,
        name: field.name,
        boundary: JSON.stringify(field.boundary),
      }
      rows.push(row);
    }

    await batchUpsertRows({
      id: state.sheetIds.thisYear,
      worksheetName: 'fields',
      rows,
      header,
      insertOrUpdate: 'UPDATE',
    });
    info('Batch upserting fields as these rows: ', rows);

    // Now re-load the entire sheet to grab new fields:
    await loadAllSheets();
  } catch (e: any) {
    info('ERROR: could not upsertFields.  Error was: ', e);
    snackbarMessage('Error updating fields:'+ e.message);
  }
});

export async function parseKMZIntoFields(file: File): Promise<{ name: string; boundary: Field['boundary']}[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const kmlFile = Object.values(zip.files).find(f => f.name.endsWith('.kml'));
  if (!kmlFile) throw new Error('No KML file found in KMZ');
  const kmlText = await kmlFile.async('text');
  const parser = new DOMParser();
  const kmlDom = parser.parseFromString(kmlText, 'text/xml');
  const geoJson = toGeoJSON.kml(kmlDom);
  return geoJson.features
    .filter(feature => feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon')
    .map(feature => ({
      name: feature.properties?.name || 'Unnamed Field',
      boundary: feature as Feature<Polygon | MultiPolygon>,
    }));
}

export const fieldName = action('fieldName', (oldName: string, newName: string) => {
  if (!newName) {
    snackbarMessage('Field name cannot be empty');
    return;
  }
  if (state.fields.find(f => f.name === newName && f.name !== oldName)) {
    snackbarMessage('Field name already exists');
    return;
  }
  const fieldIndex = state.fields.findIndex(f => f.name === oldName);
  if (fieldIndex >= 0) {
    fieldsChanged(true);
    state.fields[fieldIndex]!.name = newName;
  }
});

export const fieldBoundary = action('fieldBoundary', (name: string, boundary: Field['boundary']) => {
  const fieldIndex = state.fields.findIndex(f => f.name === name);
  if (fieldIndex >= 0) {
    fieldsChanged(true);
    state.fields[fieldIndex]!.boundary = boundary;
  } else {
    info('WARNING: could not find field with name ', name);
  }
});


export const plusLoad = action('plusLoad', async () => {
  runInAction(() => state.load.loads++);
  return saveLoad();
});

export const saveLoad = action('saveLoad', async () => {
  const load = state.load;
  if (!load.lineno) {
    snackbarMessage('ERROR: did not have a line number for this load record.  That should not happen.');
    return;
  }

  if (!load.date || !load.field ||!load.source ||!load.driver) {
    snackbarMessage('Cannot record load without a date, field, source, and driver');
    return;
  }

  const header = defaultHeaders.loads;
  const row: RowObject = {
    ...load,
    lineno: load.lineno || 2,
    geojson: JSON.stringify(load.geojson),
  };
  await batchUpsertRows({
    id: state.sheetIds.thisYear,
    worksheetName: 'loads',
    rows: [ row ],
    header,
    insertOrUpdate: 'UPDATE',
  });
  info('Loads record saved: ', row);
});

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

export const moveMapToField = action('moveMapToField', (fieldName: string) => {
  const field = state.fields.find(f => f.name === fieldName);
  if (!field) {
    snackbarMessage(`Field "${fieldName}" not found`);
    return;
  }

  const fieldFeature = field.boundary as Feature<Polygon | MultiPolygon>;
  const fieldCenter = center(fieldFeature).geometry.coordinates as [number, number];
  const fieldBbox = bbox(fieldFeature); // [minLng, minLat, maxLng, maxLat]

  // Approximate zoom level based on bounding box size (latitude/longitude span)
  const latDiff = fieldBbox[3] - fieldBbox[1];
  const lngDiff = fieldBbox[2] - fieldBbox[0];
  const maxDiff = Math.max(latDiff, lngDiff);
  // Rough zoom calculation: adjust these values based on your map's typical size
  const zoom = Math.min(18, Math.max(10, Math.floor(16 - Math.log2(maxDiff * 100))));

  // Update map view to center on the field with calculated zoom
  mapView({
    center: [fieldCenter[1], fieldCenter[0]], // Turf gives [lng, lat], Leaflet needs [lat, lng]
    zoom,
  });
});

export const gpsMode = action('gpsMode', (gpsMode: State['gpsMode']) => {
  state.gpsMode = gpsMode;
  if (gpsMode === 'me') { // switching back to 'me' needs to re-load my coords
    currentGPS(_latestBrowserGPS, true);
  } else { // map: initialize to map center
    currentGPS({ lat: state.mapView.center[0], lon: state.mapView.center[1] }, true);
  }
});

export const mode = action('mode', (mode: 'loads' | 'fields') => {
  state.mode = mode;
});

export const editingField = action('editingField', (name: string) => {
  state.editingField = name;
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
  delete state.load.lineno; // no lineno until we see if this record already exists in the list of known loads
  const knownLoad = state.loads.find(l =>
    l.date === state.load.date
    && l.source === state.load.source
    && l.field === state.load.field
    && l.driver === state.load.driver
  );
  if (knownLoad) {
    state.load.lineno = knownLoad.lineno;
    if (!('loads' in r)) { // If this change is not to the loads count, go ahead and pre-load what's in the existing list as the loads count
      state.load.loads = knownLoad.loads;
    }
  } else {
    const maxLineno = state.loads.reduce((max, l) => Math.max(max, l.lineno || 1), 1); // the "1" is for the header row
    state.load.lineno = maxLineno + 1;
    if (!('loads' in r)) {
      state.load.loads = 0; // if this makes a new load, initialize it to 0 loads
    }
  }

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
    fieldsChanged(false); // fields are now in sync w/ spreadsheet
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
  // Convert all the geojson strings back to objects
  for (const f of flds.data) {
    if ('boundary' in f) {
      f.boundary = JSON.parse(f.boundary);
    }
  }
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
  stringsToNumbers(lds);
  assertLoadsRecords(lds);
  loads(lds);
});