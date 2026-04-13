import { Box, Typography } from '@mui/material'

/**
 * Consistent page wrapper used by every admin and tenant page.
 *
 * @param {string}    title    - Page heading
 * @param {ReactNode} actions  - Buttons / actions shown top-right (wraps below title on mobile)
 * @param {ReactNode} children - Page body
 */
export default function PageContainer({ title, actions, children }) {
  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          {title}
        </Typography>
        {actions && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {actions}
          </Box>
        )}
      </Box>
      {children}
    </Box>
  )
}
