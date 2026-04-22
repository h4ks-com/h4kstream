// Mock for janus-gateway to avoid ES module issues in tests

type JanusOptions = {
  server: string;
  success?: () => void;
  error?: (err: string) => void;
  destroyed?: () => void;
};

const janusInstances: any[] = [];

const createPluginHandle = () => ({
  send: jest.fn(),
  detach: jest.fn(),
  createAnswer: jest.fn(),
  webrtcStuff: {
    pc: {
      getTransceivers: jest.fn(() => []),
      addTransceiver: jest.fn(),
    },
  },
});

const Janus = jest.fn().mockImplementation(function MockJanus(this: any, options: JanusOptions) {
  this.options = options;
  this.attach = jest.fn((attachOptions: any) => {
    const pluginHandle = createPluginHandle();
    attachOptions.success?.(pluginHandle);
    return pluginHandle;
  });
  this.destroy = jest.fn(() => {
    options.destroyed?.();
  });

  janusInstances.push(this);

  options.success?.();
});

(Janus as any).init = jest.fn(({ callback }: { callback?: () => void }) => {
  callback?.();
});
(Janus as any).isWebrtcSupported = jest.fn(() => true);
(Janus as any).randomString = jest.fn(() => 'mock-random-string');

export const __getJanusInstances = () => janusInstances;

export const __resetJanusMock = () => {
  janusInstances.length = 0;
  Janus.mockClear();
  (Janus as any).init.mockClear();
  (Janus as any).isWebrtcSupported.mockClear();
};

export default Janus;
