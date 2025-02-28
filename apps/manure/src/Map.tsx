import React from 'react';
import { observer } from 'mobx-react-lite';
import { context } from './state';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Typography } from '@mui/material';
import L from 'leaflet';

import 'leaflet/dist/leaflet.css';
import './Map.css';

const currentLocationIcon = new L.DivIcon({
  html: `
    <svg width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="10" fill="#1976D2" stroke="white" stroke-width="3"/>
    </svg>
  `,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const Map = observer(() => {
  const { state } = React.useContext(context);
  const todayLoads = state.records
    .filter(r => r.date === state.record.date && r.field === state.record.field && r.source === state.record.source)
    .reduce((sum, r) => sum + r.loads, 0);
  const seasonLoads = state.records
    .filter(r => r.field === state.record.field && r.source === state.record.source)
    .reduce((sum, r) => sum + r.loads, 0);
  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        className="mapcontainer"
        center={[40.98147222, -86.19505556]}
        zoom={13}
        zoomControl={false} // get rid of the +/- zoom buttons
      >
        <TileLayer url="https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg"/>

        {state.currentGPS.lat && state.currentGPS.lon && ( // Safe to assume this won't be used at 0,0
        <Marker
          position={[state.currentGPS.lat, state.currentGPS.lon]}
          icon={currentLocationIcon}
        >
          <Popup>You are here</Popup>
        </Marker>

      )}
      </MapContainer>
      <Typography sx={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255, 255, 255, 0.7)', padding: '5px', zIndex: 1000 }}>
        Field: {state.record.field || 'None'} | Source: {state.record.source || 'None'} | Today: {todayLoads} | Season: {seasonLoads}
      </Typography>
    </div>
  );
});