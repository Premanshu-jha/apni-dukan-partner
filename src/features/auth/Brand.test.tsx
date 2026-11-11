import { render, screen } from '@testing-library/react'
import { Brand } from './Brand'

test('the sign-in header shows the logo, read as "Clozest Partner", and the line under it', () => {
  const { container } = render(<Brand subtitle="Sign in with your mobile number." />)
  expect(screen.getByText('Clozest Partner')).toHaveClass('sr-only')
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByText('Sign in with your mobile number.')).toBeVisible()
})
