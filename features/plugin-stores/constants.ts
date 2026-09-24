// Limits for the plugin store settings. Not in `actions.ts`: a "use server" file
// may only export async functions, and the form needs these too.

export const MAX_PLUGIN_STORES = 20;
export const MAX_STORE_NAME_LENGTH = 80;
export const MAX_STORE_URL_LENGTH = 300;

// Access to a private repository: a token, and for hosts that want one a user name.
export const MAX_STORE_TOKEN_LENGTH = 1024;
export const MAX_STORE_USERNAME_LENGTH = 100;
