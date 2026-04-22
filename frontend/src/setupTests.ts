// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom doesn't implement ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
  createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) } as ImageData)),
  putImageData: jest.fn(),
  setLineDash: jest.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
