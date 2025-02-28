import React from'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@mui/material';
import { context } from './state';

export const BottomLoadButton = observer(() => {
  const { actions } = React.useContext(context);
  return (
    <Button
      variant="contained"
      color="secondary"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        zIndex: 1000,
        py: 2, // Increases padding top and bottom for a better touch target
      }}
      onClick={() => { /* actions.recordLoad() */ }}
    >
      + Load
    </Button>
  );
});