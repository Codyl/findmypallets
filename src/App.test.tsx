import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the app title and the empty state', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: /findmypallets/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/no sheets yet/i)).toBeInTheDocument()
  })
})
