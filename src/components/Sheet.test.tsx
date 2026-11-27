import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Button, Field, Sheet } from './ui'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function Form({ busy = false, sending = false, initial = '' }: { busy?: boolean; sending?: boolean; initial?: string }) {
  const [name, setName] = useState(initial)
  return (
    <Sheet open title="New khata customer" onClose={() => {}} busy={busy}>
      <Field id="n" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button busy={sending}>Save</Button>
    </Sheet>
  )
}

function at(ui: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={['/kirana/khata']}>
      <Routes>
        <Route path="*" element={<>{ui}<Where /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a sheet\'s own Help (every sheet, a salon\'s and a kirana\'s)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('nothing typed: opens Help at once, about this screen', () => {
    const confirm = vi.spyOn(window, 'confirm')
    at(<Form initial="Asha" />)
    fireEvent.click(screen.getByRole('link', { name: 'Help' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('where')).toHaveTextContent('/help')
  })

  it('something typed since it opened: asks first, and Cancel keeps the sheet and the typing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    at(<Form initial="Asha" />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Asha Rani' } })
    fireEvent.click(screen.getByRole('link', { name: 'Help' }))
    expect(confirm).toHaveBeenCalledWith('Leave without saving? Your changes will be lost.')
    expect(screen.getByTestId('where')).toHaveTextContent('/kirana/khata')
    expect(screen.getByLabelText('Name')).toHaveValue('Asha Rani')
  })

  it('while a save is on its way: Help does nothing (it would cut the save off), or isn\'t there at all', () => {
    at(<Form sending />)
    fireEvent.click(screen.getByRole('link', { name: 'Help' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/kirana/khata')
  })

  it('a sheet that says it is busy has no Help', () => {
    at(<Form busy />)
    expect(screen.queryByRole('link', { name: 'Help' })).not.toBeInTheDocument()
  })

  it('focus starts on the sheet\'s first field, not its Help', () => {
    at(<Form />)
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })
})
