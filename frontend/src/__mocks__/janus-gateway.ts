// Mock for janus-gateway to avoid ES module issues in tests

const mockJanus = {
  init: jest.fn(),
  isWebrtcSupported: jest.fn(() => true),
  randomString: jest.fn(() => 'mock-random-string'),
};

export default mockJanus;
