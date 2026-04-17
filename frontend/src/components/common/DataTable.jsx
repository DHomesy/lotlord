import { DataGrid } from '@mui/x-data-grid'
import {
  Box, Paper, Card, CardActionArea, CardContent,
  Typography, Stack, useMediaQuery, useTheme,
} from '@mui/material'

/**
 * Render the display value for a single cell, respecting valueGetter,
 * valueFormatter, and renderCell from the column definition.
 */
function getCellDisplay(col, row) {
  const raw = col.valueGetter !== undefined
    ? col.valueGetter(row[col.field], row)
    : row[col.field]

  if (col.renderCell) {
    return col.renderCell({ value: raw, row })
  }

  const formatted = col.valueFormatter !== undefined
    ? col.valueFormatter(raw, row)
    : raw

  return formatted == null ? '—' : String(formatted)
}

/**
 * Mobile card view — one card per row, columns rendered as stacked key-value pairs.
 * The first column is used as the card title.
 */
function MobileCardList({ rows, columns, getRowId, onRowClick, sx }) {
  const getId = getRowId || ((r) => r.id)
  const [titleCol, ...restCols] = columns
  // Data columns have a non-empty header and are rendered as key-value pairs.
  // Action columns (headerName === '') are rendered in a dedicated row at the
  // bottom of each card so buttons like "Pay" remain accessible on mobile.
  const dataCols   = restCols.filter((c) => c.headerName !== '')
  const actionCols = restCols.filter((c) => c.headerName === '' && c.renderCell)
  return (
    <Stack spacing={1.5} sx={sx}>
      {rows.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No rows
        </Typography>
      )}
      {rows.map((row) => {
        // Render action columns (Pay, Download, etc.) at card bottom if they produce output
        const actionNodes = actionCols
          .map((col) => ({ key: col.field, node: col.renderCell({ value: row[col.field], row }) }))
          .filter(({ node }) => node != null)

        const cardBody = (
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            {/* Title row */}
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              {getCellDisplay(titleCol, row)}
            </Typography>

            {/* Key-value rows for the remaining data columns */}
            <Stack spacing={0.5}>
              {dataCols.map((col) => (
                <Box
                  key={col.field}
                  sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', pt: '2px' }}>
                    {col.headerName}
                  </Typography>
                  <Typography variant="caption" sx={{ textAlign: 'right', wordBreak: 'break-word' }}>
                    {getCellDisplay(col, row)}
                  </Typography>
                </Box>
              ))}
            </Stack>

            {/* Action buttons row */}
            {actionNodes.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                {actionNodes.map(({ key, node }) => <Box key={key}>{node}</Box>)}
              </Stack>
            )}
          </CardContent>
        )

        if (onRowClick) {
          return (
            <Card key={getId(row)} variant="outlined" sx={{ cursor: 'pointer' }}>
              <CardActionArea onClick={() => onRowClick({ id: getId(row), row })}>
                {cardBody}
              </CardActionArea>
            </Card>
          )
        }

        return (
          <Card key={getId(row)} variant="outlined">
            {cardBody}
          </Card>
        )
      })}
    </Stack>
  )
}

/**
 * Thin wrapper around MUI DataGrid.
 * On mobile (< sm breakpoint): renders a responsive card list — no horizontal scrolling.
 * On desktop: renders the full DataGrid inside a Paper.
 */
export default function DataTable({
  rows = [],
  columns,
  loading,
  rowCount,
  paginationModel,
  onPaginationModelChange,
  getRowId,
  onRowClick,
  sx,
  ...props
}) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile) {
    return (
      <MobileCardList
        rows={rows}
        columns={columns}
        getRowId={getRowId}
        onRowClick={onRowClick}
        sx={sx}
      />
    )
  }

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Paper variant="outlined" sx={{ minWidth: 0 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          rowCount={rowCount}
          pageSizeOptions={[25, 50, 100]}
          paginationModel={paginationModel}
          onPaginationModelChange={onPaginationModelChange}
          paginationMode={rowCount !== undefined ? 'server' : 'client'}
          getRowId={getRowId || ((r) => r.id)}
          autoHeight
          disableRowSelectionOnClick
          onRowClick={onRowClick}
          sx={sx}
          {...props}
        />
      </Paper>
    </Box>
  )
}
