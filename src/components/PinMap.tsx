import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useEffect, useRef } from 'react'

const TILES = (import.meta.env.VITE_MAP_TILES as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

const pin = L.divIcon({
  className: '',
  html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--color-brand);border:3px solid var(--color-bg);box-shadow:0 2px 6px color-mix(in srgb, var(--color-scrim) 50%, transparent)"></div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

/**
 * A small map with one pin the owner can drag (or tap the map to move it). Calls onMove with the new point.
 * The pin starts where the phone's GPS (or the address search) put it. `zoom` is used when the pin is placed (closer
 * for a precise point, wider for "somewhere in this area"), never when the owner moves it.
 * @param placement changes each time the screen places the pin, so placing it again where it already is still
 *        re-centres and re-zooms the map
 */
export function PinMap({
  lat,
  lng,
  onMove,
  zoom = 18,
  placement = 0,
}: {
  lat: number
  lng: number
  onMove: (lat: number, lng: number) => void
  zoom?: number
  placement?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const moved = useRef(onMove)
  useEffect(() => {
    moved.current = onMove
  }, [onMove])

  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], zoom)
    L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m)
    const mk = L.marker([lat, lng], { draggable: true, icon: pin, keyboard: true, title: 'Salon location' }).addTo(m)
    mk.on('dragend', () => {
      const p = mk.getLatLng()
      moved.current(p.lat, p.lng)
    })
    m.on('click', (e: L.LeafletMouseEvent) => {
      mk.setLatLng(e.latlng)
      moved.current(e.latlng.lat, e.latlng.lng)
    })
    map.current = m
    marker.current = mk
    return () => {
      m.remove()
      map.current = null
      marker.current = null
    }
    // Created once; later positions come through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const placed = useRef(placement)
  useEffect(() => {
    const p = marker.current?.getLatLng()
    if (!p) return
    const newPlacement = placed.current !== placement
    placed.current = placement
    if (newPlacement) {
      marker.current?.setLatLng([lat, lng])
      map.current?.setView([lat, lng], zoom)
    } else if (p.lat !== lat || p.lng !== lng) {
      // Moved by the screen without a new placement: follow, keeping the owner's zoom
      marker.current?.setLatLng([lat, lng])
      map.current?.setView([lat, lng])
    }
  }, [lat, lng, zoom, placement])

  return (
    <div
      ref={box}
      role="application"
      aria-label="Map: drag the pin to your salon's door"
      className="h-56 w-full overflow-hidden rounded-xl border border-line"
    />
  )
}
