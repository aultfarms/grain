import React from 'react';
import { observer } from 'mobx-react-lite';
import { context } from './state';
import { Box, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';

export const Form = observer(() => {
  const { state, actions } = React.useContext(context);
  return (
    <Box sx={{ p: 2, width: '100%', height: '100%', boxSizing: 'border-box', bgcolor: '#f5f5f5', overflow: 'auto' }}>
      <TextField
        label="Date"
        type="date"
        value={state.record.date}
        onChange={e => actions.record({ date: e.target.value })}
        fullWidth
        sx={{ mb: 2 }}
      />

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="field-label">Field</InputLabel>
        <Select
          labelId="field-label"
          label="Field"
          value={state.record.field}
          onChange={e => actions.record({ field: e.target.value })}
        >
          {state.fields.map(f => (
            <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="source-label">Source</InputLabel>
        <Select
          labelId="source-label"
          label="Source"
          value={state.record.source}
          onChange={e => actions.record({ source: e.target.value })}
        >
          {state.sources.map(f => (
            <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="driver-label">Driver</InputLabel>
        <Select
          labelId="driver-label"
          label="Driver"
          value={state.record.driver}
          onChange={e => actions.record({ driver: e.target.value })}
        >
          {state.drivers.map(f => (
            <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
});