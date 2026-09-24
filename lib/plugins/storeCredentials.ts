import "server-only";
import { openSecret, sealSecret } from "@/lib/secrets";

// The access token of a private plugin store, sealed for that store. The context
// is the store's normalised address (`PluginStore.key`), so a token that is
// copied to another store's row does not open there: whoever can write to the
// database cannot send one host's token to another. Whoever changes a store's
// address has to seal its token again.
//
// `openStoreToken` is what the store client (BARY-105) will call. It gives `null`
// when there is nothing, or nothing that can be opened, and the client then goes
// on without a token: a private repository fails to clone, a public one does not
// care. It must never log or return the token beyond that call, and only ever send
// it to the address it was sealed for.

function context(storeKey: string): string {
  return `pluginStore:${storeKey}`;
}

/** Seals a token for a store. Throws `SecretsKeyError` if there is no key. */
export function sealStoreToken(storeKey: string, token: string): string {
  return sealSecret(token, context(storeKey));
}

/** Opens a store's token, or `null`. Never throws. */
export function openStoreToken(
  storeKey: string,
  sealed: string,
): string | null {
  return openSecret(sealed, context(storeKey));
}
