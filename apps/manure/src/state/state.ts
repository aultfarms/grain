import { observable } from 'mobx';
import debug from 'debug';
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
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

export type LoadsRecord = {
  lineno?: number, // If existing in the spreadsheet, this is filled out.  If new row, this is empty
  date: string,
  field: string,
  source: string,
  loads: number,
  driver: string,
  geojson: FeatureCollection<Point>,
};
export const loadsHeaders: (keyof LoadsRecord)[] = [
  'date',
  'field',
  'source',
  'loads',
  'driver',
  'geojson',
];
export function assertLoadsRecord(o: any): asserts o is LoadsRecord {
  if (!o || typeof o!== 'object') throw new Error('Expected LoadsRecord to be a truthy object');
  if (typeof o.lineno !== 'undefined' && typeof o.lineno !== 'number') throw new Error('Expected LoadsRecord.lineno to be a number if it exists');
  if (typeof o.date !== 'string') throw new Error('Expected LoadsRecord.date ('+o.date+') to be a string');
  if (typeof o.field !=='string') throw new Error('Expected LoadsRecord.field to be a string');
  if (typeof o.source!=='string') throw new Error('Expected LoadsRecord.source to be a string');
  if (typeof o.loads!== 'number') throw new Error('Expected LoadsRecord.loads to be a number');
  if (typeof o.driver!=='string') throw new Error('Expected LoadsRecord.driver to be a string');
  if (typeof o.geojson!== 'object') throw new Error('Expected LoadsRecord.geojson to be a GeoJSON object');
  if (o.geojson.type!== 'FeatureCollection') throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection');
  if (!Array.isArray(o.geojson.features)) throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Features');
  // If there are any features, they must be points:
  for (const feature of o.geojson.features) {
    if (feature.type!== 'Feature') throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Features');
    if (feature.geometry.type!== 'Point') throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Points');
    if (!Array.isArray(feature.geometry.coordinates)) throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Points');
    if (feature.geometry.coordinates.length!== 2) throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Points');
    if (typeof feature.geometry.coordinates[0]!== 'number') throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Points');
    if (typeof feature.geometry.coordinates[1]!== 'number') throw new Error('Expected LoadsRecord.geojson to be a FeatureCollection of Points');
  }
};
export function assertLoadsRecords(o: any): asserts o is LoadsRecord[] {
  if (!o ||!Array.isArray(o)) throw new Error('Expected LoadsRecords to be a truthy array');
  for (const [index, l] of o.entries()) {
    try { assertLoadsRecord(l) }
    catch(e: any) { throw new Error('Expected LoadsRecords['+index+'] to be a LoadRecord: '+e.message) }
  }
}
export type LoadsRecordGeoJSONProps = Omit<LoadsRecord,'geojson'>;
export type LoadsRecordGeoJSON = FeatureCollection<Point, LoadsRecordGeoJSONProps>;


export type Field = {
  lineno?: number,
  name: string;
  boundary: Feature<Polygon | MultiPolygon>,
};
export const fieldsHeaders: (keyof Field)[] = [ 'name', 'boundary' ];
export function assertField(o: any): asserts o is Field {
  if (!o || typeof o!== 'object') throw new Error('Expected Field to be a truthy object');
  if (typeof o.lineno !== 'undefined' && typeof o.lineno !== 'number') throw new Error('Expected Field.lineno to be a number if it exists');
  if (typeof o.name !=='string') throw new Error('Expected Field.name to be a string');
  if (typeof o.boundary!== 'object') throw new Error('Expected Field.boundary to be a GeoJSON object');
  if (o.boundary.type!== 'Feature') throw new Error('Expected Field.boundary to be a Feature');
  if (o.boundary.geometry.type!== 'Polygon' && o.boundary.geometry.type!== 'MultiPolygon') throw new Error('Expected Field.boundary to be a Polygon or MultiPolygon');
}
export function assertFields(o: any): asserts o is Field[] {
  if (!o ||!Array.isArray(o)) throw new Error('Expected Fields to be a truthy array');
  for (const field of o) assertField(field);
}
export type FieldGeoJSONProps = {
  name: string,
};
export type FieldGeoJSON = FeatureCollection<Polygon | MultiPolygon, FieldGeoJSONProps>;

export type Source = {
  lineno?: number,
  name: string;
  type: 'solid' | 'liquid';
  acPerLoad: number; // Used for computing how many loads should go on a field
};
export const sourcesHeaders: (keyof Source)[] = [ 'name', 'type', 'acPerLoad' ];
export function assertSource(o: any): asserts o is Source {
  if (!o || typeof o!== 'object') throw new Error('Expected Source to be a truthy object');
  if (typeof o.lineno !== 'undefined' && typeof o.lineno !== 'number') throw new Error('Expected Source.lineno to be a number if it exists');
  if (typeof o.name !=='string') throw new Error('Expected Source.name to be a string');
  if (typeof o.type !=='string') throw new Error('Expected Source.type to be a string');
  if (typeof o.acPerLoad!== 'number') throw new Error('Expected Source.acPerLoad to be a number');
}
export function assertSources(o: any): asserts o is Source[] {
  if (!o ||!Array.isArray(o)) throw new Error('Expected Sources to be a truthy array');
  for (const source of o) assertSource(source);
}

export type Driver = {
  lineno?: number,
  name: string
};
export const driversHeaders: (keyof Driver)[] = [ 'name' ];
export function assertDriver(o: any): asserts o is Driver {
  if (!o || typeof o!== 'object') throw new Error('Expected Driver to be a truthy object');
  if (typeof o.lineno !== 'undefined' && typeof o.lineno !== 'number') throw new Error('Expected Driver.lineno to be a number if it exists');
  if (typeof o.name !=='string') throw new Error('Expected Driver.name to be a string');
}
export function assertDrivers(o: any): asserts o is Driver[] {
 if (!o ||!Array.isArray(o)) throw new Error('Expected Drivers to be a truthy array');
  for (const driver of o) assertDriver(driver);
}

export const defaultHeaders = {
  fields: fieldsHeaders,
  sources: sourcesHeaders,
  drivers: driversHeaders,
  loads: loadsHeaders,
};

export type BigData = {
  rev: number
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
  mapView: {
    center: LatLngTuple,
    zoom: number,
  },
  // Field boundary editing on the map:
  mode: 'loads' | 'fields',
  editingField: string,
  fieldsChanged: boolean,

  // Data loaded from sheets
  loads: LoadsRecord[];
  fields: Field[];
  sources: Source[];
  drivers: Driver[];

  // Cached geojson to update whenever fields or loads changes
  geojsonFields: BigData,
  geojsonLoads: BigData,

  // Form fields:
  load: LoadsRecord;

  // config for importing fields from KMZ
  config: {
    modalOpen: boolean;
  },

  loadingError: string,
  loading: boolean,
  // Snackbar messages at bottom of screen:
  snackbar: {
    open: boolean,
    message: string,
  },

};

export function assertMapView(o: any): asserts o is State['mapView'] {
  if (!o || typeof o!== 'object') throw new Error('Expected MapView to be a truthy object');
  if (!o.center ||!Array.isArray(o.center) || o.center.length!== 2) throw new Error('Expected MapView.center to be an array of length 2');
  for (const c of o.center) {
    if (typeof c!== 'number') throw new Error('Expected MapView.center to be an array of numbers');
  }
 if (typeof o.zoom!== 'number') throw new Error('Expected MapView.zoom to be a number');
  if (o.zoom < 0) throw new Error('Expected MapView.zoom to be a positive number');
  if (o.zoom > 20) throw new Error('Expected MapView.zoom to be < 20');
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

const load: LoadsRecord = {
  date: new Date().toISOString().split('T')[0],
  field: '',
  source: '',
  loads: 0,
  driver: '',
  geojson: { type: 'FeatureCollection', features: [] },
};
try {
  const localload = JSON.parse(localStorage.getItem('af.manure.loadload') || '{}');
  assertLoadsRecord(localload);
  // Only keep these around to pre-select the selection boxes from last time:
  load.field = localload.field;
  load.source = localload.source;
  load.driver = localload.driver;
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
let mapView: State['mapView'] = {
  center: [ 40.98147222, -86.19505556 ],
  zoom: 12,
};
try {
  const localmapview = JSON.parse(localStorage.getItem('af.manure.mapview') || '{}');
  assertMapView(localmapview);
  mapView = localmapview;
} catch(e: any) {
  info('No valid previous map center/zoom found in localstorage, using default');
}


export const state = observable<State>({
  thisYear: new Date().getFullYear(),
  sheetIds,
  currentGPS,
  gpsMode: 'me',
  mapView,
  mode: 'loads', // or 'fields'
  editingField: '',
  fieldsChanged: false,

  loads: [],
  fields: [],
  sources: [],
  drivers: [],

  geojsonFields: { rev: 0 },
  geojsonLoads: { rev: 0 },

  load,

  config: {
    modalOpen: false,
  },

  loadingError: '',
  loading: true,
  snackbar: {
    open: false,
    message: '',
  },

});