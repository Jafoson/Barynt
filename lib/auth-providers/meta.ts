/**
 * Display name and icon of every sign-in provider `registry.ts` can enable —
 * both belong to the brand, not in the translation files. Pure data without
 * the Auth.js provider modules, so client components (`AuthCard`,
 * `AccountConnections`) can import it.
 *
 * Icons are written as literals so `bun run icons:build` picks them up. A
 * brand without an icon in the bundled sets gets a neutral one: a key for
 * identity providers, an arrow for everything else.
 */
export interface AuthProviderMeta {
  label: string;
  icon: string;
}

const IDP_ICON = "lucide:key-round";
const GENERIC_ICON = "lucide:log-in";

export const AUTH_PROVIDER_META: Record<string, AuthProviderMeta> = {
  github: { label: "GitHub", icon: "lucide:github" },
  google: { label: "Google", icon: "logos:google-icon" },
  gitlab: { label: "GitLab", icon: "logos:gitlab" },
  "microsoft-entra-id": { label: "Microsoft", icon: "logos:microsoft-icon" },
  apple: { label: "Apple", icon: "mdi:apple" },
  "42-school": { label: "42 School", icon: GENERIC_ICON },
  asgardeo: { label: "Asgardeo", icon: IDP_ICON },
  atlassian: { label: "Atlassian", icon: "logos:atlassian" },
  auth0: { label: "Auth0", icon: "logos:auth0-icon" },
  authentik: { label: "authentik", icon: IDP_ICON },
  "azure-ad-b2c": { label: "Azure AD B2C", icon: "logos:microsoft-icon" },
  "azure-devops": { label: "Azure DevOps", icon: "mdi:azure-devops" },
  "bankid-no": { label: "BankID", icon: IDP_ICON },
  battlenet: { label: "Battle.net", icon: "mdi:battlenet" },
  beyondidentity: { label: "Beyond Identity", icon: IDP_ICON },
  bitbucket: { label: "Bitbucket", icon: "logos:bitbucket" },
  box: { label: "Box", icon: "mdi:box" },
  "boxyhq-saml": { label: "SAML", icon: IDP_ICON },
  bungie: { label: "Bungie", icon: GENERIC_ICON },
  "click-up": { label: "ClickUp", icon: "logos:clickup-icon" },
  cognito: { label: "Cognito", icon: "logos:aws-cognito" },
  coinbase: { label: "Coinbase", icon: GENERIC_ICON },
  concept2: { label: "Concept2", icon: GENERIC_ICON },
  descope: { label: "Descope", icon: IDP_ICON },
  discord: { label: "Discord", icon: "logos:discord-icon" },
  dribbble: { label: "Dribbble", icon: "logos:dribbble-icon" },
  dropbox: { label: "Dropbox", icon: "logos:dropbox" },
  "duende-identity-server6": { label: "Duende IdentityServer", icon: IDP_ICON },
  eventbrite: { label: "Eventbrite", icon: "logos:eventbrite-icon" },
  eveonline: { label: "EVE Online", icon: GENERIC_ICON },
  facebook: { label: "Facebook", icon: "logos:facebook" },
  faceit: { label: "FACEIT", icon: GENERIC_ICON },
  figma: { label: "Figma", icon: "logos:figma" },
  foursquare: { label: "Foursquare", icon: "mdi:foursquare" },
  freshbooks: { label: "FreshBooks", icon: GENERIC_ICON },
  frontegg: { label: "Frontegg", icon: IDP_ICON },
  fusionauth: { label: "FusionAuth", icon: IDP_ICON },
  hubspot: { label: "HubSpot", icon: "logos:hubspot" },
  huggingface: { label: "Hugging Face", icon: "logos:hugging-face-icon" },
  "identity-server4": { label: "IdentityServer4", icon: IDP_ICON },
  instagram: { label: "Instagram", icon: "logos:instagram-icon" },
  kakao: { label: "Kakao", icon: GENERIC_ICON },
  keycloak: { label: "Keycloak", icon: IDP_ICON },
  kinde: { label: "Kinde", icon: IDP_ICON },
  line: { label: "LINE", icon: GENERIC_ICON },
  linkedin: { label: "LinkedIn", icon: "logos:linkedin-icon" },
  logto: { label: "Logto", icon: IDP_ICON },
  mailchimp: { label: "Mailchimp", icon: "logos:mailchimp-icon" },
  mailru: { label: "Mail.ru", icon: GENERIC_ICON },
  mastodon: { label: "Mastodon", icon: "logos:mastodon-icon" },
  mattermost: { label: "Mattermost", icon: "logos:mattermost-icon" },
  medium: { label: "Medium", icon: "logos:medium-icon" },
  naver: { label: "Naver", icon: GENERIC_ICON },
  netlify: { label: "Netlify", icon: "logos:netlify-icon" },
  nextcloud: { label: "Nextcloud", icon: GENERIC_ICON },
  notion: { label: "Notion", icon: "logos:notion-icon" },
  okta: { label: "Okta", icon: "logos:okta-icon" },
  onelogin: { label: "OneLogin", icon: IDP_ICON },
  hydra: { label: "Ory Hydra", icon: IDP_ICON },
  osso: { label: "Osso", icon: IDP_ICON },
  osu: { label: "osu!", icon: GENERIC_ICON },
  passage: { label: "Passage", icon: IDP_ICON },
  patreon: { label: "Patreon", icon: "logos:patreon" },
  "ping-id": { label: "Ping Identity", icon: IDP_ICON },
  pinterest: { label: "Pinterest", icon: "logos:pinterest" },
  pipedrive: { label: "Pipedrive", icon: "logos:pipedrive" },
  reddit: { label: "Reddit", icon: "logos:reddit-icon" },
  roblox: { label: "Roblox", icon: GENERIC_ICON },
  salesforce: { label: "Salesforce", icon: "logos:salesforce" },
  simplelogin: { label: "SimpleLogin", icon: IDP_ICON },
  slack: { label: "Slack", icon: "logos:slack-icon" },
  spotify: { label: "Spotify", icon: "logos:spotify-icon" },
  strava: { label: "Strava", icon: "mdi:strava" },
  threads: { label: "Threads", icon: "logos:threads-icon" },
  tiktok: { label: "TikTok", icon: "logos:tiktok-icon" },
  todoist: { label: "Todoist", icon: "logos:todoist-icon" },
  trakt: { label: "Trakt", icon: GENERIC_ICON },
  twitch: { label: "Twitch", icon: "logos:twitch" },
  twitter: { label: "X", icon: "logos:x" },
  "united-effects": { label: "United Effects", icon: IDP_ICON },
  vipps: { label: "Vipps", icon: GENERIC_ICON },
  vk: { label: "VK", icon: "mdi:vk" },
  webex: { label: "Webex", icon: GENERIC_ICON },
  wechat: { label: "WeChat", icon: "mdi:wechat" },
  wikimedia: { label: "Wikimedia", icon: "mdi:wikipedia" },
  wordpress: { label: "WordPress.com", icon: "logos:wordpress-icon" },
  workos: { label: "WorkOS", icon: "logos:workos-icon" },
  yandex: { label: "Yandex", icon: "logos:yandex-ru" },
  zitadel: { label: "ZITADEL", icon: IDP_ICON },
  zoho: { label: "Zoho", icon: "logos:zoho" },
  zoom: { label: "Zoom", icon: "logos:zoom-icon" },
  // The generic OIDC provider — its real label comes from `AUTH_OIDC_NAME`.
  oidc: { label: "SSO", icon: IDP_ICON },
};

export function authProviderMeta(id: string): AuthProviderMeta {
  return AUTH_PROVIDER_META[id] ?? { label: id, icon: GENERIC_ICON };
}
