import { expect, it } from 'vitest'

import { RollingNumber, registerRollingNumber } from './rolling-number'

it('updates the real rolling-number controller and releases it on disconnect', () => {
  registerRollingNumber()
  const element = document.createElement(RollingNumber.tag)
  Reflect.set(element, 'value', 2074)
  document.body.appendChild(element)
  expect(element.textContent).toContain('2 074')
  Reflect.set(element, 'value', 2340)
  expect(element.textContent).toContain('2 340')
  element.remove()
  expect(element.textContent).toBe('2 340')
  document.body.appendChild(element)
  expect(element.textContent).toContain('2 340')
  element.remove()
})
