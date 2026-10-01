import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Wallet,
  X,
  Copy,
  Check,
  LogOut,
  RefreshCw,
  Download,
} from "lucide-react";
import { useWallet } from "./wallet/WalletContext";
import { displayBalance } from "./wallet/core";

const walletBrands = [
  {
    name: "MetaMask",
    logo: "/wallets/metamask.svg",
    url: "https://metamask.io/download/",
  },
  {
    name: "Phantom",
    logo: "/wallets/phantom.png",
    url: "https://phantom.com/",
  },
];
function WalletLogo({ name, icon }: { name: string; icon?: string | null }) {
  const src =
    walletBrands.find((brand) =>
      name.toLowerCase().includes(brand.name.toLowerCase()),
    )?.logo || icon;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img
      className="wallet-logo"
      src={src}
      alt=""
      width={28}
      height={28}
      onError={() => setFailed(true)}
    />
  ) : (
    <Wallet size={22} />
  );
}
export function Action({ to, children, secondary = false }: any) {
  return (
    <Link
      to={to}
      className={
        "button action-button " + (secondary ? "secondary" : "primary")
      }
    >
      <span>{children}</span>
      <span className="button-arrow">
        <ArrowUpRight size={18} />
      </span>
    </Link>
  );
}
export function CopyButton({ value, label = "Copy address" }: any) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon"
      title={done ? "Copied" : label}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {}
      }}
    >
      {done ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}
export function WalletControl() {
  const wallet = useWallet(),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const balance = wallet.busy
    ? "Reading balance..."
    : displayBalance(wallet.balance);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button
        className="button wallet-button"
        aria-label={wallet.account ? "Open wallet balance" : "Connect wallet"}
        title={wallet.account ? balance : undefined}
        onClick={() => setOpen(true)}
      >
        {wallet.account ? (
          <WalletLogo name={wallet.walletName} />
        ) : (
          <Wallet size={16} />
        )}
        <span>
          {wallet.account
            ? wallet.status === "connected"
              ? balance
              : "Switch network"
            : "Connect wallet"}
        </span>
      </button>
      <dialog
        ref={dialog}
        className="wallet-dialog"
        aria-labelledby="wallet-title"
        onCancel={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <button
          className="icon modal-close"
          aria-label="Close wallet"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <h2 id="wallet-title">
          {wallet.account ? "Balance" : "Connect wallet"}
        </h2>
        {wallet.account ? (
          <>
            <div className="wallet-balance-row">
              <WalletLogo name={wallet.walletName} />
              <output aria-label="ETH balance" aria-live="polite">
                {wallet.status === "connected" ? balance : "-- ETH"}
              </output>
              <button
                className="icon"
                title="Refresh balance"
                aria-label="Refresh balance"
                disabled={wallet.busy}
                onClick={() => wallet.refresh()}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            <p className="wallet-network">Robinhood Chain</p>
            {wallet.balanceError && !wallet.busy && (
              <p role="alert" className="error">
                Balance unavailable. Retry refresh.
              </p>
            )}
            {wallet.status !== "connected" && (
              <button
                className="button primary"
                disabled={wallet.busy}
                onClick={() => wallet.switchChain()}
              >
                Switch to Robinhood
                <ArrowUpRight size={16} />
              </button>
            )}
            <button
              className="button secondary"
              onClick={() => {
                wallet.disconnect();
                setOpen(false);
              }}
            >
              <LogOut size={16} /> Disconnect
            </button>
          </>
        ) : (
          <div className="wallet-options">
            {wallet.wallets.map((w) => (
              <button
                key={w.id}
                className="wallet-choice"
                disabled={wallet.busy}
                onClick={async () => {
                  await wallet.connect(w.id);
                }}
              >
                <WalletLogo name={w.name} icon={w.icon} />
                {w.name}
                <ArrowUpRight size={16} />
              </button>
            ))}
            {!wallet.discovering &&
              walletBrands
                .filter(
                  (brand) =>
                    !wallet.wallets.some((w) =>
                      w.name.toLowerCase().includes(brand.name.toLowerCase()),
                    ),
                )
                .map((brand) => (
                  <a
                    key={brand.name}
                    className="wallet-choice wallet-install"
                    href={brand.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <WalletLogo name={brand.name} />
                    <span>{brand.name}</span>
                    <small>Install</small>
                    <Download size={16} />
                  </a>
                ))}
            {wallet.busy && <p role="status">Confirm in your wallet</p>}
            {wallet.discovering && !wallet.wallets.length && (
              <p role="status">Finding wallets...</p>
            )}
          </div>
        )}
        {wallet.error && (
          <p role="alert" className="error">
            {wallet.error}
          </p>
        )}
      </dialog>
    </>
  );
}
