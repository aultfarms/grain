// utils.ts or App.tsx
import * as turf from '@turf/turf';
import debug from 'debug';
import { GPS } from './state/state';

const info = debug('af/manure#util:info');

export function computeFieldArea(geoJson: any): number {
  const polygon = turf.polygon(geoJson.coordinates);
  return turf.area(polygon) / 4046.86; // Convert square meters to acres
}

export async function getCurrentGPSFromBrowser(): Promise<GPS> {
  let coords: GPS = { lat: 0, lon: 0 };
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
  }
  return coords;
}