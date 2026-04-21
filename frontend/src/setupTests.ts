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

// Suppress console logs from Janus cleanup during tests
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('Cleaning up Janus connection')) {
    return; // Suppress Janus cleanup messages
  }
  originalConsoleLog(...args);
};
