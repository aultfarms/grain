import React from 'react';
import { observer } from 'mobx-react-lite';
import { context } from './state';
import { AppBar, Toolbar, Typography, Button, Tooltip, IconButton, Menu, MenuItem } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';

export const NavBar = observer(() => {
  const { state, actions } = React.useContext(context);

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <AppBar position="static">
      <Toolbar sx={{ display: 'flex', justifyContent:'space-between' }}>

        <img style={{ paddingRight: '10px' }} src="/manure/aultfarms_logo.png" width="75"/>

        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Manure
        </Typography>

        <Button variant="contained" color="secondary" onClick={actions.plusLoad}>
          + Load
        </Button>

        <Tooltip title="Re-Center Map">
          <IconButton color="inherit" onClick={() => actions.mapView({ center: [state.currentGPS.lat, state.currentGPS.lon] })}>
            <GpsFixedIcon/>
          </IconButton>
        </Tooltip>

        <Tooltip title="Menu">
          <IconButton color="inherit" onClick={handleMenuOpen}>
            <MenuIcon />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
        >
          <MenuItem onClick={() => { actions.mode(state.mode === 'loads' ? 'fields' : 'loads'); handleMenuClose(); }}>Manage {state.mode === 'loads' ? 'Fields' : 'Loads'}</MenuItem>
          <MenuItem onClick={() => { actions.toggleConfigModal(); handleMenuClose(); }}>Config</MenuItem>
        </Menu>

      </Toolbar>
    </AppBar>
  );
});