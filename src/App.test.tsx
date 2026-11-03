import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('App', () => {
  it('renders the app title and the empty state', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /findmypallets/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no sheets yet/i)).toBeInTheDocument()
  })

  it('opens a sheet for review and returns home', async () => {
    render(<App />)
    await userEvent.upload(
      screen.getByLabelText(/add from excel or csv/i, { selector: 'input' }),
      new File(['Plate,Lot\nABC123,7\n'], 'Dock A.csv'),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: /review dock a/i }),
    )

    expect(screen.getByRole('heading', { name: 'Dock A' })).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('0 of 1 found')).toBeInTheDocument()
  })

  it('goes from upload to scanning a plate and finding it', async () => {
    render(<App />)
    await userEvent.upload(
      screen.getByLabelText(/add from excel or csv/i, { selector: 'input' }),
      new File(['License Plate,Pallet\nABC123,P-1\nXYZ789,P-2\n'], 'Dock A.csv'),
    )
    await screen.findByRole('button', { name: /review dock a/i })

    await userEvent.click(screen.getByRole('button', { name: /start scanning/i }))
    expect(screen.getByRole('heading', { name: 'Scan' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /start scanning/i }))
    await userEvent.keyboard('XYZ789{Enter}')

    const result = screen.getByRole('status', { name: /scan result/i })
    expect(result).toHaveAttribute('data-kind', 'match')
    expect(screen.getByText('1 of 2 found')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('1 of 2 found')).toBeInTheDocument()
  })
})
