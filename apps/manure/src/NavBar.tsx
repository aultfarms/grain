import React from 'react';
import { observer } from 'mobx-react-lite';
import { context } from './state';
import { AppBar, Toolbar, Typography, Button, Tooltip, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';

export const NavBar = observer(() => {
  const { state, actions } = React.useContext(context);
  return (
    <AppBar position="static">
      <Toolbar sx={{ display: 'flex', justifyContent:'space-between' }}>

        <img style={{ paddingRight: '10px' }} src="/manure/aultfarms_logo.png" width="75"/>

        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Manure
        </Typography>

        <Button variant="contained" color="secondary" onClick={() => { /* actions.recordLoad */ }}>
          + Load
        </Button>

        <Tooltip title="Re-Center Map">
          <IconButton color="inherit" onClick={() => actions.map({ center: [state.currentGPS.lat, state.currentGPS.lon] })}>
            <GpsFixedIcon/>
          </IconButton>
        </Tooltip>

        <Tooltip title="Config">
          <IconButton color="inherit" onClick={actions.toggleConfigModal}>
            <MenuIcon/>
          </IconButton>
        </Tooltip>

      </Toolbar>
    </AppBar>
  );
});