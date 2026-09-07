import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  initNetworkMonitor,
  isOnline,
  onConnectivityChange,
  resetNetworkMonitorForTests,
} from './network-monitor';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(),
  },
}));

const mockedNetInfo = NetInfo as unknown as {
  addEventListener: jest.Mock;
};

describe('initNetworkMonitor', () => {
  let netInfoListener: ((state: Partial<NetInfoState>) => void) | undefined;
  const unsubscribeNetInfo = jest.fn();

  beforeEach(() => {
    resetNetworkMonitorForTests();
    netInfoListener = undefined;
    unsubscribeNetInfo.mockClear();
    mockedNetInfo.addEventListener.mockReset();
    mockedNetInfo.addEventListener.mockImplementation((listener: (state: Partial<NetInfoState>) => void) => {
      netInfoListener = listener;
      return unsubscribeNetInfo;
    });
  });

  afterEach(() => {
    resetNetworkMonitorForTests();
  });

  it('returns an unsubscribe that drops the NetInfo subscription', () => {
    const stop = initNetworkMonitor();
    expect(mockedNetInfo.addEventListener).toHaveBeenCalledTimes(1);

    stop();
    expect(unsubscribeNetInfo).toHaveBeenCalledTimes(1);
  });

  it('replaces a leaked listener when init is called again (Fast Refresh)', () => {
    initNetworkMonitor();
    initNetworkMonitor();

    expect(unsubscribeNetInfo).toHaveBeenCalledTimes(1);
    expect(mockedNetInfo.addEventListener).toHaveBeenCalledTimes(2);
  });

  it('notifies app listeners only when connectivity actually changes', () => {
    initNetworkMonitor();
    const appListener = jest.fn();
    const stopApp = onConnectivityChange(appListener);

    netInfoListener?.({ isConnected: true });
    netInfoListener?.({ isConnected: true });
    netInfoListener?.({ isConnected: false });

    expect(isOnline()).toBe(false);
    expect(appListener).toHaveBeenCalledTimes(2);
    expect(appListener).toHaveBeenNthCalledWith(1, true);
    expect(appListener).toHaveBeenNthCalledWith(2, false);

    stopApp();
    netInfoListener?.({ isConnected: true });
    expect(appListener).toHaveBeenCalledTimes(2);
  });
});
