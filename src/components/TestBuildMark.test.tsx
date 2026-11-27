import { render, screen } from '@testing-library/react'
import { TestBuildMark } from './TestBuildMark'

describe('the kirana test build label', () => {
  it('shows in a kirana test build, without catching taps', () => {
    render(<TestBuildMark on />)
    const mark = screen.getByRole('status')
    expect(mark).toHaveTextContent('Kirana test build')
    expect(mark.className).toContain('pointer-events-none')
  })

  it('is not there otherwise', () => {
    const { container } = render(<TestBuildMark on={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
