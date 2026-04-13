import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack, Button, MenuItem, Typography, Chip, IconButton, Box } from '@mui/material'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CloseIcon from '@mui/icons-material/Close'
import UnitPicker from '../pickers/UnitPicker'

const CATEGORIES = ['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other']
const MAX_FILES = 5
const MAX_FILE_SIZE_MB = 20

const schema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  category: z.enum(['plumbing', 'electric', 'hvac', 'appliance', 'structural', 'other'], {
    errorMap: () => ({ message: 'Category is required' }),
  }),
  priority: z.enum(['low', 'medium', 'high', 'emergency']).default('medium'),
})

export default function MaintenanceForm({ onSubmit, defaultValues, loading, lockedUnitId, lockedUnitLabel, showPhotos = false }) {
  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues || { priority: 'medium' },
  })
  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [fileError, setFileError] = useState('')

  useEffect(() => {
    if (lockedUnitId) setValue('unitId', lockedUnitId)
  }, [lockedUnitId, setValue])

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || [])
    const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024)
    if (oversized.length) {
      setFileError(`Each file must be under ${MAX_FILE_SIZE_MB} MB`)
      e.target.value = ''
      return
    }
    const combined = [...files, ...selected].slice(0, MAX_FILES)
    setFiles(combined)
    setFileError(combined.length === MAX_FILES && selected.length > MAX_FILES - files.length
      ? `Maximum ${MAX_FILES} photos allowed`
      : '')
    e.target.value = ''
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setFileError('')
  }

  return (
    <Stack component="form" onSubmit={handleSubmit((v) => onSubmit(v, files))} spacing={2} sx={{ pt: 1 }}>
      {lockedUnitId ? (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" color="text.secondary">Unit:</Typography>
          <Chip label={lockedUnitLabel || lockedUnitId} size="small" />
        </Stack>
      ) : (
        <Controller
          name="unitId"
          control={control}
          render={({ field }) => (
            <UnitPicker
              value={field.value ?? null}
              onChange={field.onChange}
              error={!!errors.unitId}
              helperText={errors.unitId?.message}
            />
          )}
        />
      )}
      <TextField label="Title" {...register('title')} error={!!errors.title} helperText={errors.title?.message} />
      <TextField label="Description" multiline rows={3} {...register('description')} />
      <TextField label="Category" select defaultValue={defaultValues?.category || ''} {...register('category')} error={!!errors.category} helperText={errors.category?.message}>
        {CATEGORIES.map((c) => (
          <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</MenuItem>
        ))}
      </TextField>
      <TextField label="Priority" select {...register('priority')} defaultValue={defaultValues?.priority || 'medium'}>
        <MenuItem value="low">Low</MenuItem>
        <MenuItem value="medium">Medium</MenuItem>
        <MenuItem value="high">High</MenuItem>
        <MenuItem value="emergency">Emergency</MenuItem>
      </TextField>

      {showPhotos && (
        <Box>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outlined"
            size="small"
            startIcon={<AttachFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES}
          >
            Add Photos ({files.length}/{MAX_FILES})
          </Button>
          {fileError && <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>{fileError}</Typography>}
          {files.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
              {files.map((f, i) => (
                <Chip
                  key={i}
                  label={f.name}
                  size="small"
                  onDelete={() => removeFile(i)}
                  deleteIcon={<CloseIcon />}
                />
              ))}
            </Stack>
          )}
        </Box>
      )}

      <Button type="submit" variant="contained" disabled={loading}>
        {loading ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  )
}
