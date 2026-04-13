import { Box, Typography, Button } from '@mui/material'
import InboxIcon from '@mui/icons-material/Inbox'

export default function EmptyState({ message = 'No records found', onAdd, addLabel = 'Add one' }) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <InboxIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
      <Typography color="text.secondary" gutterBottom>
        {message}
      </Typography>
      {onAdd && (
        <Button variant="outlined" size="small" onClick={onAdd} sx={{ mt: 1 }}>
          {addLabel}
        </Button>
      )}
    </Box>
  )
}
