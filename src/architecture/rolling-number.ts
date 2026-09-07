import { Schema as S } from 'effect'
import { CustomElement } from 'foldkit'

import {
  type RollingNumberController,
  createRollingNumber,
} from '@kitlangton/rolling-number'

export const RollingNumber = CustomElement.define({
  tag: 'infer-rolling-number',
  properties: { value: S.Number },
  events: {},
})

export const registerRollingNumber = (): void => {
  if (customElements.get(RollingNumber.tag)) {
    return
  }

  class RollingNumberElement extends HTMLElement {
    private currentValue = 0
    private controller: RollingNumberController | undefined

    get value(): number {
      return this.currentValue
    }

    set value(value: number) {
      this.currentValue = value
      this.controller?.update({ value })
    }

    connectedCallback(): void {
      this.controller = createRollingNumber(this, {
        value: this.currentValue,
        locales: 'fr-FR',
        format: { maximumFractionDigits: 0 },
        duration: 650,
      })
    }

    disconnectedCallback(): void {
      this.controller?.destroy()
      this.controller = undefined
    }
  }

  customElements.define(RollingNumber.tag, RollingNumberElement)
}
