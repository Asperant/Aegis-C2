import React from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('./services/signalRService', () => {
  const connection = {
    state: 'Disconnected',
    onreconnecting: vi.fn(),
    onreconnected: vi.fn(),
    onclose: vi.fn(),
    off: vi.fn(),
  }

  return {
    default: connection,
    startConnection: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('./services/terminalEngineStore', () => ({
  primeTerminalEngine: vi.fn(),
}))

vi.mock('./services/fleetTelemetryStore', () => ({
  primeFleetTelemetry: vi.fn(),
}))

vi.mock('./utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

vi.mock('./pages/Login', () => ({
  default: () => <div>Login Page Mock</div>,
}))

vi.mock('./pages/TacticalMap', () => ({
  default: () => <div>Tactical Map Mock</div>,
}))

vi.mock('./pages/CommandTerminal', () => ({
  default: () => <div>Command Terminal Mock</div>,
}))

vi.mock('./pages/Analytics', () => ({
  default: () => <div>Analytics Mock</div>,
}))

const { default: App } = await import('./App')

describe('App route protection', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('redirects unauthenticated users to login route', async () => {
    render(<App />)

    expect(await screen.findByText('Login Page Mock')).toBeInTheDocument()
  })

  it('shows protected route content when token exists', async () => {
    localStorage.setItem('aegis_token', 'token-abc')

    render(<App />)

    expect(await screen.findByText('Tactical Map Mock')).toBeInTheDocument()
  })
})
