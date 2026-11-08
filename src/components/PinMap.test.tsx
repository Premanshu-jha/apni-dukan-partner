import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A stand-in for Leaflet that records where the map was centred and at which zoom. */
const leaflet = vi.hoisted(() => {
  const state = {
    setView: [] as { at: [number, number]; zoom?: number }[],
    markerAt: { lat: 0, lng: 0 },
    handlers: {} as Record<string, () => void>,
  }
  const map = {
    setView: (at: [number, number], zoom?: number) => {
      state.setView.push({ at, zoom })
      return map
    },
    on: () => map,
    remove: () => {},
  }
  const marker = {
    addTo: () => marker,
    on: (event: string, fn: () => void) => {
      state.handlers[event] = fn
      return marker
    },
    getLatLng: () => state.markerAt,
    setLatLng: ([lat, lng]: [number, number]) => {
      state.markerAt = { lat, lng }
      return marker
    },
  }
  const L = {
    divIcon: () => ({}),
    map: () => map,
    tileLayer: () => ({ addTo: () => {} }),
    marker: ([lat, lng]: [number, number]) => {
      state.markerAt = { lat, lng }
      return marker
    },
  }
  return { state, L }
})

vi.mock('leaflet', () => ({ default: leaflet.L }))
vi.mock('leaflet/dist/leaflet.css', () => ({}))

import { zoomFor } from '../features/shop/addressPin'
import { PinMap } from './PinMap'

describe('PinMap zoom', () => {
  beforeEach(() => {
    leaflet.state.setView = []
    leaflet.state.handlers = {}
  })

  it('zooms by precision each time the pin is placed, and keeps the owner’s zoom when they move it', () => {
    let moved: [number, number] | null = null
    const onMove = (lat: number, lng: number) => {
      moved = [lat, lng]
    }
    // Placed by GPS: 18
    const view = render(<PinMap lat={28.627} lng={77.372} zoom={18} placement={1} onMove={onMove} />)
    expect(leaflet.state.setView.at(-1)).toEqual({ at: [28.627, 77.372], zoom: 18 })

    // Placed by the address search, only the area known: 15
    view.rerender(<PinMap lat={28.6215} lng={77.3652} zoom={zoomFor('AREA')} placement={2} onMove={onMove} />)
    expect(leaflet.state.setView.at(-1)).toEqual({ at: [28.6215, 77.3652], zoom: 15 })

    // Placed again at the same point (a new search, a street this time): re-centred and zoomed to 17
    view.rerender(<PinMap lat={28.6215} lng={77.3652} zoom={zoomFor('STREET')} placement={3} onMove={onMove} />)
    expect(leaflet.state.setView.at(-1)).toEqual({ at: [28.6215, 77.3652], zoom: 17 })

    // The owner drags it: the screen follows with the same placement, and the map isn't re-zoomed
    const before = leaflet.state.setView.length
    leaflet.state.markerAt = { lat: 28.6301, lng: 77.3702 }
    act(() => leaflet.state.handlers.dragend())
    expect(moved).toEqual([28.6301, 77.3702])
    view.rerender(<PinMap lat={28.6301} lng={77.3702} zoom={17} placement={3} onMove={onMove} />)
    expect(leaflet.state.setView).toHaveLength(before)
  })
})
