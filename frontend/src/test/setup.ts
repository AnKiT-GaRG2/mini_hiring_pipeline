import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no <dialog> modal support; emulate just enough of it that the
// component under test behaves as it does in a browser (open state, close event).
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
}

// Testing Library sets this itself only when vitest globals are enabled.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => cleanup())
