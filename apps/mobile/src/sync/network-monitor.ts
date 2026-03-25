import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

type NetworkListener = (isConnected: boolean) => void;

let currentState: boolean = false;
const listeners: Set<NetworkListener> = new Set();

export function initNetworkMonitor(): void {
  NetInfo.addEventListener((state: NetInfoState) => {
    const connected = Boolean(state.isConnected && state.isInternetReachable);
    if (connected !== currentState) {
      currentState = connected;
      listeners.forEach((listener) => listener(connected));
    }
  });
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
