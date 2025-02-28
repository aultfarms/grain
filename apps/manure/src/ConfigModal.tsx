import React from 'react';
import { observer } from 'mobx-react-lite';
import { context } from './state';
import { Modal, Box, Typography, Input } from '@mui/material';

export const ConfigModal = observer(() => {
  const { state, actions } = React.useContext(context);
  return (
    <Modal open={state.isConfigModalOpen} onClose={actions.toggleConfigModal}>
      <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'white', p: 4 }}>
        <Typography variant="h6">Upload KMZ</Typography>
        <Input
          type="file"
          onChange={e => e.target.files && actions.uploadKMZ(e.target.files[0])}
        />
      </Box>
    </Modal>
  );
});