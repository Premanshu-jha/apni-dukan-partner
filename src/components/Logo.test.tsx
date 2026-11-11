import { render, screen } from '@testing-library/react'
import { Logo } from './Logo'

test('screen readers read the name, never the drawing', () => {
  const { container } = render(<Logo name="Clozest Partner" />)
  expect(screen.getByText('Clozest Partner')).toHaveClass('sr-only')
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('two logos on one screen keep their own gradient and cut-out', () => {
  const { container } = render(
    <>
      <Logo />
      <Logo />
    </>,
  )
  const ids = [...container.querySelectorAll('linearGradient, mask')].map((e) => e.id)
  expect(new Set(ids).size).toBe(4)
  // Every fill and mask points at an id in its own logo
  for (const svg of container.querySelectorAll('svg')) {
    const own = new Set([...svg.querySelectorAll('linearGradient, mask')].map((e) => e.id))
    for (const e of svg.querySelectorAll('[fill^="url("], [mask]')) {
      const ref = (e.getAttribute('mask') ?? e.getAttribute('fill'))!.slice(5, -1)
      expect(own.has(ref)).toBe(true)
    }
  }
})
