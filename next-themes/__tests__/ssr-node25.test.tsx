// @vitest-environment node

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Regression test for https://github.com/pacocoursey/next-themes/issues/389
//
// Node.js 25 ships an experimental Web Storage API where `window` is aliased to
// `globalThis`. That makes the historic `typeof window === 'undefined'` SSR guard
// evaluate to `false` on the server, so next-themes wrongly takes the browser code
// path during SSR and crashes (e.g. `localStorage.getItem is not a function` /
// `window.matchMedia is not a function`).
//
// These tests recreate the Node 25 server environment and assert that server
// rendering no longer touches browser-only globals.

describe('Node.js 25 SSR guard (window aliased to globalThis)', () => {
  const globals = globalThis as Record<string, unknown>
  const hadWindow = 'window' in globals
  const hadLocalStorage = 'localStorage' in globals
  const originalWindow = globals.window
  const originalLocalStorage = globals.localStorage

  beforeEach(() => {
    vi.resetModules()

    // Node 25 aliases `window` to `globalThis` on the server.
    globals.window = globalThis

    // Node 25 exposes a *partial* localStorage. Simulate the broken state where
    // calling `getItem` throws, matching the original crash report.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem() {
          throw new TypeError('localStorage.getItem is not a function')
        }
      }
    })

    // `document` and `window.matchMedia` remain browser-only and are absent on the
    // server even on Node 25.
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined')
  })

  afterEach(() => {
    if (hadWindow) {
      globals.window = originalWindow
    } else {
      delete globals.window
    }

    if (hadLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: originalLocalStorage
      })
    } else {
      delete globals.localStorage
    }

    vi.resetModules()
  })

  test('ThemeProvider renders to static markup without throwing', async () => {
    const { ThemeProvider } = await import('../src/index')

    expect(() =>
      renderToStaticMarkup(
        React.createElement(ThemeProvider, null, React.createElement('span', null, 'child'))
      )
    ).not.toThrow()
  })

  test('server render does not read from the broken localStorage', async () => {
    const getItem = vi.fn(() => {
      throw new TypeError('localStorage.getItem is not a function')
    })
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: { getItem }
    })

    const { ThemeProvider } = await import('../src/index')

    renderToStaticMarkup(
      React.createElement(ThemeProvider, { defaultTheme: 'system', enableSystem: true }, 'child')
    )

    expect(getItem).not.toHaveBeenCalled()
  })
})
