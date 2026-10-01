export const MAX_ARTWORK_BYTES = 2 * 1024 * 1024;
export type ArtworkTicket = {
  account: string;
  digest: string;
  expires: number;
};
export function artworkMessage(ticket: ArtworkTicket) {
  return `Oopad image upload\nApplication: Oopad launchpad\nWallet: ${ticket.account}\nFile SHA-256: ${ticket.digest}\nExpires: ${new Date(ticket.expires).toISOString()}\nPublish this token image publicly. No transaction or token allowance.`;
}
