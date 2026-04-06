import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Login from './Login'

describe('Login page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders login form fields and submit button', () => {
    render(<Login />)

    expect(screen.getByPlaceholderText('GKS-X9ID...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••••••')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows API error message when credentials are invalid', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: 'Yetkisiz erişim' }),
    })

    render(<Login />)

    fireEvent.change(screen.getByPlaceholderText('GKS-X9ID...'), {
      target: { value: 'commander' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'wrong-password' },
    })

    fireEvent.click(screen.getByRole('button'))

    expect(await screen.findByText(/Yetkisiz erişim/i)).toBeInTheDocument()
  })

  it('stores token in localStorage on successful login', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: 'jwt-token-123' }),
    })

    render(<Login />)

    fireEvent.change(screen.getByPlaceholderText('GKS-X9ID...'), {
      target: { value: 'commander' },
    })
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'topsecret' },
    })

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(localStorage.getItem('aegis_token')).toBe('jwt-token-123')
    })
  })
})
