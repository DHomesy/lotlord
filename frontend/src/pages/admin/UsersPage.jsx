import { useState } from 'react'
import { Button, Dialog, DialogTitle, DialogContent, MenuItem } from '@mui/material'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TextField, Stack } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PageContainer from '../../components/layout/PageContainer'
import DataTable from '../../components/common/DataTable'
import { useUsers, useCreateUser } from '../../hooks/useUsers'

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Min 8 characters'),
  role: z.enum(['admin', 'employee', 'tenant']).default('employee'),
})

function UserForm({ onSubmit, loading }) {
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { role: 'employee' } })
  return (
    <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ pt: 1 }}>
      <TextField label="Name" {...register('name')} error={!!errors.name} helperText={errors.name?.message} />
      <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
      <TextField label="Password" type="password" {...register('password')} error={!!errors.password} helperText={errors.password?.message} />
      <TextField label="Role" select {...register('role')} defaultValue="employee">
        <MenuItem value="admin">Admin</MenuItem>
        <MenuItem value="employee">Employee</MenuItem>
        <MenuItem value="tenant">Tenant</MenuItem>
      </TextField>
      <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Saving…' : 'Save'}</Button>
    </Stack>
  )
}

const columns = [
  { field: 'name', headerName: 'Name', flex: 1 },
  { field: 'email', headerName: 'Email', flex: 1.5 },
  { field: 'role', headerName: 'Role', width: 100 },
  { field: 'created_at', headerName: 'Created', width: 120, valueFormatter: (v) => v?.slice(0, 10) },
]

export default function UsersPage() {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useUsers()
  const { mutate: create, isPending } = useCreateUser()

  const rows = Array.isArray(data) ? data : (data?.users ?? [])

  return (
    <PageContainer
      title="Users"
      actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>New User</Button>}
    >
      <DataTable rows={rows} columns={columns} loading={isLoading} />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New User</DialogTitle>
        <DialogContent>
          <UserForm onSubmit={(v) => create(v, { onSuccess: () => setOpen(false) })} loading={isPending} />
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
