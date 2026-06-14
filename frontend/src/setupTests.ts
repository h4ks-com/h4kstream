// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'util'

// jsdom's bundled engine doesn't expose TextEncoder/TextDecoder globally even though every
// browser does; pull them from node's util so UTF-8 codec paths work under test.
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder
}

// jsdom doesn't implement ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom doesn't implement HTMLMediaElement playback control; stub the methods the editor's
// streaming <audio> element uses so unmount/cleanup doesn't log "Not implemented".
HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve())
HTMLMediaElement.prototype.pause = jest.fn()
HTMLMediaElement.prototype.load = jest.fn()

// jsdom doesn't implement canvas 2D — stub globally so any test that renders
// a component with a <canvas> doesn't crash on getContext('2d').
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  closePath: jest.fn(),
  fillText: jest.fn(),
  drawImage: jest.fn(),
  createImageData: jest.fn(
    () => ({ data: new Uint8ClampedArray(4) }) as ImageData
  ),
  putImageData: jest.fn(),
  setLineDash: jest.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext
