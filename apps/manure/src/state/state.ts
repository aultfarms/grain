import { observable } from 'mobx';
import debug from 'debug';
import type { FeatureCollection, GeoJSON } from 'geojson';
import { LatLngTuple } from 'leaflet';
const info = debug('af/manure#state:info');

//---------------------------------------
// Types and Assertions
//---------------------------------------

export type GPS = { lat: number; lon: number };
export function assertGPS(o: any): asserts o is GPS {
  if (!o || typeof o!== 'object') throw new Error('Expected GPS to be a truthy object');
  if (typeof o.lat !== 'number') throw new Error('Expected GPS.lat to be a number');
  if (typeof o.lon !== 'number') throw new Error('Expected GPS.lon to be a number');
}

export type LoadRecord = {
  lineno?: number, // If existing in the spreadsheet, this is filled out.  If new row, this is empty
  date: string,
  field: string,
  source: string,
  loads: number,
  driver: string,
  geojson: FeatureCollection, // FeatureCollection of all the points/paths for that day
};
export function assertLoadRecord(o: any): asserts o is LoadRecord {
  if (!o || typeof o!== 'object') throw new Error('Expected LoadRecord to be a truthy object');
  if (typeof o.date !== 'string') throw new Error('Expected LoadRecord.date to be a string');
  if (typeof o.field !=='string') throw new Error('Expected LoadRecord.field to be a string');
  if (typeof o.source!=='string') throw new Error('Expected LoadRecord.source to be a string');
  if (typeof o.loads!== 'number') throw new Error('Expected LoadRecord.loads to be a number');
  if (typeof o.driver!=='string') throw new Error('Expected LoadRecord.driver to be a string');
  if (typeof o.geojson!== 'object') throw new Error('Expected LoadRecord.geojson to be an object');
};

export type Field = {
  lineno?: number,
  name: string;
  boundary: GeoJSON,
};
export type Source = {
  lineno?: number,
  name: string;
  type: 'solid' | 'liquid';
  acPerLoad: number; // Used for computing how many loads should go on a field
};
export type Driver = {
  lineno?: number,
  name: string
};

export type State = {
  thisYear: number;
  sheetIds: {
    thisYear: string,
    lastYear: string,
  },

  // Where we are now:
  currentGPS: GPS,
  gpsMode: 'map' | 'me',
  map: {
    center: LatLngTuple,
    zoom: number,
  },

  // Data loaded from sheets
  records: LoadRecord[];
  fields: Field[];
  sources: Source[];
  drivers: Driver[];

  // Form fields:
  record: LoadRecord;

  // config for importing fields from KMZ
  config: {
    modalOpen: boolean;
  },

  loading: boolean,
  // Snackbar messages at bottom of screen:
  snackbar: {
    open: boolean,
    message: string,
  },

};

export function assertMap(o: any): asserts o is State['map'] {
  if (!o || typeof o!== 'object') throw new Error('Expected Map to be a truthy object');
  if (!o.center ||!Array.isArray(o.center) || o.center.length!== 2) throw new Error('Expected Map.center to be an array of length 2');
  for (const c of o.center) {
    if (typeof c!== 'number') throw new Error('Expected Map.center to be an array of numbers');
  }
  if (typeof o.zoom!== 'number') throw new Error('Expected Map.zoom to be a number');
  if (o.zoom < 0) throw new Error('Expected Map.zoom to be a positive number');
  if (o.zoom > 20) throw new Error('Expected Map.zoom to be < 20');
}


//-------------------------------------------------
// Load anything from localstorage:
//-------------------------------------------------


export function assertSheetIds(o: any): asserts o is State['sheetIds'] {
  if (!o || typeof o !== 'object') throw new Error('Expected SheetsIds to be a truthy object');
  if (!o.thisYear|| typeof o.thisYear!=='string') throw new Error('Expected SheetIds.thisYear to be a string');
  if (typeof o.lastYear!=='string') throw new Error('Expected SheetIds.lastYear to be a string');
}
let sheetIds = { thisYear: '', lastYear: '' };
try {
  const localsheetIds = JSON.parse(localStorage.getItem('af.manure.sheetIds') || '{}');
  assertSheetIds(localsheetIds);
  sheetIds = localsheetIds; // confirm that these are still valid in initialize
} catch (e) {
  info('No valid cached sheetIds found in localstorage, will look for them in Google');
}

const record: LoadRecord = {
  date: new Date().toISOString().split('T')[0],
  field: '',
  source: '',
  loads: 0,
  driver: '',
  geojson: {
    type: 'FeatureCollection',
    features: [],
  },
};
try {
  const localRecord = JSON.parse(localStorage.getItem('af.manure.loadRecord') || '{}');
  assertLoadRecord(localRecord);
  // Only keep these around to pre-select the selection boxes from last time:
  record.field = localRecord.field;
  record.source = localRecord.source;
  record.loads = localRecord.loads;
  record.driver = localRecord.driver;
} catch(e: any) {
  info('No valid previous record found in localstorage, using default');
}

// Cached GPS last time we were open:
let currentGPS = { lat: 40.98147222, lon: -86.19505556 };
try {
  const localcurrentGPS = JSON.parse(localStorage.getItem('af.manure.currentGPS') || '{}');
  assertGPS(localcurrentGPS);
  currentGPS = localcurrentGPS;
} catch(e: any) {
  info('No valid previous GPS found in localstorage, using default');
}

// Cached map last time we were open:
let map: State['map'] = {
  center: [ 40.98147222, -86.19505556 ],
  zoom: 12,
};
try {
  const localmap = JSON.parse(localStorage.getItem('af.manure.map') || '{}');
  assertMap(localmap);
  map = localmap;
} catch(e: any) {
  info('No valid previous map center/zoom found in localstorage, using default');
}


export const state = observable<State>({
  thisYear: new Date().getFullYear(),
  sheetIds,
  currentGPS,
  gpsMode: 'me',
  map,
  records: [],
  fields: [],
  sources: [],
  drivers: [],

  record,

  config: {
    modalOpen: false,
  },

  loading: true,
  snackbar: {
    open: false,
    message: '',
  },

});