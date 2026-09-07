import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type NetworkListener = (isConnected: boolean) => void;

let currentState: boolean = false;
const listeners: Set<NetworkListener> = new Set();
let unsubscribeNetInfo: (() => void) | undefined;

export function initNetworkMonitor(): () => void {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
    const connected = Boolean(state.isConnected);
    if (connected !== currentState) {
      currentState = connected;
      listeners.forEach((listener) => listener(connected));
    }
  });

  return () => {
    unsubscribeNetInfo?.();
    unsubscribeNetInfo = undefined;
  };
}

export function isOnline(): boolean {
  return currentState;
}

export function onConnectivityChange(listener: NetworkListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetNetworkMonitorForTests(): void {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = undefined;
  currentState = false;
  listeners.clear();
}
