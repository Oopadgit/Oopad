import type { WalletOption, WalletProviderApi } from "./core";

type ProviderAnnouncement = {
  info: { uuid: string; name: string; icon: string };
  provider: unknown;
};

export function safeIcon(value: unknown): string | null {
  return typeof value === "string" &&
    value.length < 100_000 &&
    /^data:image\/(?:png|webp|jpeg|svg\+xml)[;,]/i.test(value)
    ? value
    : null;
}

function isProvider(value: unknown): value is WalletProviderApi {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as WalletProviderApi).request === "function"
  );
}

export function walletOptions(
  announcements: readonly ProviderAnnouncement[],
  injected?: unknown,
  phantom?: unknown,
): WalletOption[] {
  const options: WalletOption[] = [];
  for (const detail of announcements) {
    if (
      !isProvider(detail?.provider) ||
      !detail.info ||
      typeof detail.info.uuid !== "string"
    )
      continue;
    const id = `eip6963:${detail.info.uuid}`;
    if (
      options.some(
        (option) => option.id === id || option.provider === detail.provider,
      )
    )
      continue;
    options.push({
      id,
      name:
        typeof detail.info.name === "string"
          ? detail.info.name.trim().slice(0, 80) || "Browser wallet"
          : "Browser wallet",
      icon: safeIcon(detail.info.icon),
      provider: detail.provider,
    });
  }
  for (const [id, provider] of [
    ["phantom", phantom],
    ["injected", injected],
  ] as const) {
    if (
      !isProvider(provider) ||
      options.some((option) => option.provider === provider)
    )
      continue;
    const flags = provider as WalletProviderApi & {
      isPhantom?: boolean;
      isMetaMask?: boolean;
    };
    options.push({
      id,
      name:
        id === "phantom" || flags.isPhantom
          ? "Phantom"
          : flags.isMetaMask
            ? "MetaMask"
            : "Browser wallet",
      icon: null,
      provider,
    });
  }
  return options;
}
