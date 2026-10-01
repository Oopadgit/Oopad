import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createStore } from "mipd";
import { WalletSession, type WalletState } from "./session";
import {
  type WalletChoice,
  type WalletOption,
  type WalletProviderApi,
  type WalletTransaction,
} from "./core";
import type { Hex } from "viem";
import { walletOptions } from "./discovery";

export type WalletValue = WalletState & {
  wallets: WalletChoice[];
  discovering: boolean;
  connect(id?: string): Promise<void>;
  disconnect(): void;
  switchChain(): Promise<void>;
  refresh(): Promise<void>;
  sendTransaction(transaction: WalletTransaction): Promise<Hex>;
  signUploadMessage(message: string): Promise<Hex>;
};

const Context = createContext<WalletValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const session = useRef<WalletSession | null>(null);
  if (!session.current) session.current = new WalletSession();
  const controller = session.current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [discovering, setDiscovering] = useState(true);

  useEffect(() => {
    const store = createStore();
    const update = () => {
      const browser = window as Window & {
        ethereum?: WalletProviderApi;
        phantom?: { ethereum?: WalletProviderApi };
      };
      setOptions(
        walletOptions(
          store.getProviders(),
          browser.ethereum,
          browser.phantom?.ethereum,
        ),
      );
    };
    update();
    const unsubscribe = store.subscribe(update);
    const timer = window.setTimeout(() => {
      update();
      setDiscovering(false);
    }, 600);
    window.addEventListener("ethereum#initialized", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ethereum#initialized", update);
      unsubscribe();
      store.destroy();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    if (!state.account || state.status !== "connected") return;
    const refresh = () => {
      if (!document.hidden) void controller.refresh();
    };
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [controller, state.account, state.status]);

  const value: WalletValue = {
    ...state,
    wallets: options.map(({ id, name, icon }) => ({ id, name, icon })),
    discovering,
    connect: async (id) => {
      const option = id
        ? options.find((wallet) => wallet.id === id)
        : options[0];
      if (option) await controller.connect(option);
      else controller.unavailable();
    },
    disconnect: () => {
      controller.disconnect();
    },
    switchChain: controller.switchChain,
    refresh: controller.refresh,
    sendTransaction: controller.sendTransaction,
    signUploadMessage: controller.signUploadMessage,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWallet(): WalletValue {
  const wallet = useContext(Context);
  if (!wallet) throw new Error("useWallet must be inside WalletProvider");
  return wallet;
}
