import {
  inspectAccount,
  requestAccount,
  ROBINHOOD_CHAIN,
  switchToRobinhood,
  walletError,
  sendCheckedTransaction,
  type WalletTransaction,
  type AccountSnapshot,
  type WalletOption,
} from "./core";

export type WalletState = AccountSnapshot & {
  status:
    | "disconnected"
    | "connecting"
    | "connected"
    | "wrong-chain"
    | "unknown-chain";
  walletName: string;
  busy: boolean;
  error: string | null;
};

const empty: WalletState = {
  status: "disconnected",
  account: null,
  chainId: null,
  balance: null,
  balanceError: null,
  walletName: "",
  busy: false,
  error: null,
};

export class WalletSession {
  private state: WalletState = { ...empty };
  private listeners = new Set<() => void>();
  private selected: WalletOption | null = null;
  private connection = 0;
  private read = 0;
  private release = () => {};

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(value: Partial<WalletState>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((listener) => listener());
  }

  disconnect = () => {
    this.connection++;
    this.read++;
    this.release();
    this.release = () => {};
    this.selected = null;
    this.update(empty);
  };

  unavailable = () => {
    this.update({
      error: "That wallet is unavailable. Check your browser wallet and retry.",
    });
  };

  private bind(option: WalletOption) {
    const provider = option.provider;
    const changed = () => {
      if (this.selected !== option) return;
      this.update({
        account: null,
        chainId: null,
        balance: null,
        balanceError: null,
        status: "unknown-chain",
      });
      void this.sync();
    };
    const disconnected = () => {
      if (this.selected === option) this.disconnect();
    };
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", changed);
    provider.on?.("disconnect", disconnected);
    this.release = () => {
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", changed);
      provider.removeListener?.("disconnect", disconnected);
    };
  }

  private async sync() {
    const option = this.selected;
    if (!option) return;
    const ticket = ++this.read;
    const connection = this.connection;
    this.update({ balance: null, balanceError: null, error: null });
    try {
      const snapshot = await inspectAccount(option.provider);
      if (
        ticket !== this.read ||
        connection !== this.connection ||
        this.selected !== option
      )
        return;
      if (!snapshot.account) {
        this.disconnect();
        return;
      }
      this.update({
        ...snapshot,
        status:
          snapshot.chainId === ROBINHOOD_CHAIN.id ? "connected" : "wrong-chain",
      });
    } catch (error) {
      if (
        ticket === this.read &&
        connection === this.connection &&
        this.selected === option
      ) {
        this.update({
          account: null,
          chainId: null,
          balance: null,
          status: "unknown-chain",
          error: walletError(error),
        });
      }
    }
  }

  connect = async (option: WalletOption) => {
    if (this.state.busy) return;
    this.disconnect();
    const ticket = ++this.connection;
    this.update({ status: "connecting", walletName: option.name, busy: true });
    try {
      const account = await requestAccount(option.provider);
      if (ticket !== this.connection) return;
      this.selected = option;
      this.update({ account, status: "unknown-chain" });
      this.bind(option);
      await this.sync();
    } catch (error) {
      if (ticket === this.connection) {
        this.disconnect();
        this.update({ error: walletError(error) });
      }
    } finally {
      if (ticket === this.connection) this.update({ busy: false });
    }
  };

  switchChain = async () => {
    const option = this.selected;
    if (!option || this.state.busy) return;
    const ticket = this.connection;
    this.update({ busy: true, error: null });
    try {
      await switchToRobinhood(
        option.provider,
        () => ticket === this.connection && this.selected === option,
      );
      if (ticket === this.connection && this.selected === option)
        await this.sync();
    } catch (error) {
      if (ticket === this.connection && this.selected === option)
        this.update({ error: walletError(error) });
    } finally {
      if (ticket === this.connection) this.update({ busy: false });
    }
  };

  refresh = async () => {
    if (!this.selected || this.state.busy) return;
    const ticket = this.connection;
    this.update({ busy: true });
    try {
      await this.sync();
    } finally {
      if (ticket === this.connection) this.update({ busy: false });
    }
  };

  sendTransaction = async (transaction: WalletTransaction) => {
    const option = this.selected;
    const ticket = this.connection;
    const revision = this.read;
    if (
      !option ||
      this.state.busy ||
      this.state.status !== "connected" ||
      this.state.account?.toLowerCase() !== transaction.account.toLowerCase()
    )
      throw new Error("Connect the reviewed wallet on Robinhood Chain first.");
    this.update({ busy: true, error: null });
    try {
      return await sendCheckedTransaction(
        option.provider,
        transaction,
        () =>
          ticket === this.connection &&
          revision === this.read &&
          this.selected === option &&
          this.state.status === "connected" &&
          this.state.chainId === ROBINHOOD_CHAIN.id &&
          this.state.account?.toLowerCase() ===
            transaction.account.toLowerCase(),
      );
    } catch (error) {
      if (ticket === this.connection && this.selected === option)
        this.update({ error: walletError(error) });
      throw error;
    } finally {
      if (ticket === this.connection && this.selected === option)
        this.update({ busy: false });
    }
  };

  signUploadMessage = async (message: string): Promise<`0x${string}`> => {
    if (!message.startsWith("Oopad image upload\n"))
      throw Error("Invalid upload message");
    return this.signScopedMessage(message);
  };

  private signScopedMessage = async (
    message: string,
  ): Promise<`0x${string}`> => {
    const option = this.selected;
    const account = this.state.account;
    const ticket = this.connection;
    const revision = this.read;
    if (
      !option ||
      !account ||
      this.state.busy ||
      message.length > 1500 ||
      !message.toLowerCase().includes(account.toLowerCase())
    )
      throw new Error("Connect the signing wallet first.");
    this.update({ busy: true, error: null });
    try {
      const accounts = await option.provider.request({
        method: "eth_accounts",
      });
      if (
        ticket !== this.connection ||
        revision !== this.read ||
        this.selected !== option ||
        this.state.account?.toLowerCase() !== account.toLowerCase() ||
        !Array.isArray(accounts) ||
        typeof accounts[0] !== "string" ||
        accounts[0].toLowerCase() !== account.toLowerCase()
      )
        throw new Error("Wallet account changed.");
      const bytes = new TextEncoder().encode(message);
      const encoded = `0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
      const signature = await option.provider.request({
        method: "personal_sign",
        params: [encoded, account],
      });
      if (
        ticket !== this.connection ||
        revision !== this.read ||
        this.selected !== option ||
        this.state.account?.toLowerCase() !== account.toLowerCase()
      )
        throw new Error("The signing wallet changed.");
      if (typeof signature !== "string" || !/^0x[\da-f]{130}$/i.test(signature))
        throw new Error("This wallet returned an unsupported signature.");
      return signature as `0x${string}`;
    } finally {
      if (ticket === this.connection && this.selected === option)
        this.update({ busy: false });
    }
  };

  dispose = () => {
    this.disconnect();
    this.listeners.clear();
  };
}
