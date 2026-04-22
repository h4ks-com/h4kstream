import React from 'react';
import { act, cleanup, render } from '@testing-library/react';

jest.mock('janus-gateway', () => {
  const MockJanus = jest.fn().mockImplementation(function MockJanus(this: any, options: any) {
    this.attach = jest.fn((attachOptions: any) => {
      const pluginHandle = {
        send: jest.fn(),
        detach: jest.fn(),
        createAnswer: jest.fn(),
        webrtcStuff: {
          pc: {
            getTransceivers: jest.fn(() => []),
            addTransceiver: jest.fn(),
          },
        },
      };

      attachOptions.success?.(pluginHandle);
      return pluginHandle;
    });
    this.destroy = jest.fn(() => {
      options.destroyed?.();
    });

    options.success?.();
  });

  (MockJanus as any).init = jest.fn(({ callback }: { callback?: () => void }) => {
    callback?.();
  });
  (MockJanus as any).isWebrtcSupported = jest.fn(() => true);
  (MockJanus as any).randomString = jest.fn(() => 'mock-random-string');

  return {
    __esModule: true,
    default: MockJanus,
  };
});

import Janus from 'janus-gateway';

import {
  __getActiveJanusConnectionCountForTests,
  __resetJanusConnectionsForTests,
  useJanusStream,
} from './useJanusStream';

type MockedJanusModule = jest.Mock & {
  init: jest.Mock;
  isWebrtcSupported: jest.Mock;
};

const mockedJanus = Janus as unknown as MockedJanusModule;

function HookHarness() {
  useJanusStream({
    janusUrl: 'wss://radio.h4ks.com/janusws',
    streamId: 1,
  });

  return null;
}

describe('useJanusStream', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetJanusConnectionsForTests();
    mockedJanus.mockClear();
    mockedJanus.init.mockClear();
    mockedJanus.isWebrtcSupported.mockClear();
  });

  afterEach(() => {
    cleanup();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    __resetJanusConnectionsForTests();
    jest.useRealTimers();
  });

  it('reuses the Janus session across StrictMode remounts', () => {
    let unmount!: () => void;

    act(() => {
      ({ unmount } = render(
        <React.StrictMode>
          <HookHarness />
        </React.StrictMode>
      ));
    });

    expect(mockedJanus.init).toHaveBeenCalledTimes(1);
    expect(__getActiveJanusConnectionCountForTests()).toBe(1);

    act(() => {
      unmount();
      jest.advanceTimersByTime(250);
    });

    expect(__getActiveJanusConnectionCountForTests()).toBe(0);
  });
});