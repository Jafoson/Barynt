import type { Provider } from "next-auth/providers";
import School42 from "next-auth/providers/42-school";
import Apple from "next-auth/providers/apple";
import Asgardeo from "next-auth/providers/asgardeo";
import Atlassian from "next-auth/providers/atlassian";
import Auth0 from "next-auth/providers/auth0";
import Authentik from "next-auth/providers/authentik";
import AzureAdB2c from "next-auth/providers/azure-ad-b2c";
import AzureDevops from "next-auth/providers/azure-devops";
import BankidNo from "next-auth/providers/bankid-no";
import Battlenet from "next-auth/providers/battlenet";
import Beyondidentity from "next-auth/providers/beyondidentity";
import Bitbucket from "next-auth/providers/bitbucket";
import Box from "next-auth/providers/box";
import BoxyhqSaml from "next-auth/providers/boxyhq-saml";
import Bungie from "next-auth/providers/bungie";
import ClickUp from "next-auth/providers/click-up";
import Cognito from "next-auth/providers/cognito";
import Coinbase from "next-auth/providers/coinbase";
import Concept2 from "next-auth/providers/concept2";
import Descope from "next-auth/providers/descope";
import Discord from "next-auth/providers/discord";
import Dribbble from "next-auth/providers/dribbble";
import Dropbox from "next-auth/providers/dropbox";
import DuendeIdentityServer6 from "next-auth/providers/duende-identity-server6";
import Eventbrite from "next-auth/providers/eventbrite";
import Eveonline from "next-auth/providers/eveonline";
import Facebook from "next-auth/providers/facebook";
import Faceit from "next-auth/providers/faceit";
import Figma from "next-auth/providers/figma";
import Foursquare from "next-auth/providers/foursquare";
import Freshbooks from "next-auth/providers/freshbooks";
import Frontegg from "next-auth/providers/frontegg";
import Fusionauth from "next-auth/providers/fusionauth";
import Github from "next-auth/providers/github";
import Gitlab from "next-auth/providers/gitlab";
import Google from "next-auth/providers/google";
import Hubspot from "next-auth/providers/hubspot";
import Huggingface from "next-auth/providers/huggingface";
import IdentityServer4 from "next-auth/providers/identity-server4";
import Instagram from "next-auth/providers/instagram";
import Kakao from "next-auth/providers/kakao";
import Keycloak from "next-auth/providers/keycloak";
import Kinde from "next-auth/providers/kinde";
import Line from "next-auth/providers/line";
import Linkedin from "next-auth/providers/linkedin";
import Logto from "next-auth/providers/logto";
import Mailchimp from "next-auth/providers/mailchimp";
import Mailru from "next-auth/providers/mailru";
import Mastodon from "next-auth/providers/mastodon";
import Mattermost from "next-auth/providers/mattermost";
import Medium from "next-auth/providers/medium";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";
import Naver from "next-auth/providers/naver";
import Netlify from "next-auth/providers/netlify";
import Nextcloud from "next-auth/providers/nextcloud";
import Notion from "next-auth/providers/notion";
import Okta from "next-auth/providers/okta";
import Onelogin from "next-auth/providers/onelogin";
import OryHydra from "next-auth/providers/ory-hydra";
import Osso from "next-auth/providers/osso";
import Osu from "next-auth/providers/osu";
import Passage from "next-auth/providers/passage";
import Patreon from "next-auth/providers/patreon";
import PingId from "next-auth/providers/ping-id";
import Pinterest from "next-auth/providers/pinterest";
import Pipedrive from "next-auth/providers/pipedrive";
import Reddit from "next-auth/providers/reddit";
import Roblox from "next-auth/providers/roblox";
import Salesforce from "next-auth/providers/salesforce";
import Simplelogin from "next-auth/providers/simplelogin";
import Slack from "next-auth/providers/slack";
import Spotify from "next-auth/providers/spotify";
import Strava from "next-auth/providers/strava";
import Threads from "next-auth/providers/threads";
import Tiktok from "next-auth/providers/tiktok";
import Todoist from "next-auth/providers/todoist";
import Trakt from "next-auth/providers/trakt";
import Twitch from "next-auth/providers/twitch";
import Twitter from "next-auth/providers/twitter";
import UnitedEffects from "next-auth/providers/united-effects";
import Vipps from "next-auth/providers/vipps";
import Vk from "next-auth/providers/vk";
import Webex from "next-auth/providers/webex";
import Wechat from "next-auth/providers/wechat";
import Wikimedia from "next-auth/providers/wikimedia";
import Wordpress from "next-auth/providers/wordpress";
import Workos from "next-auth/providers/workos";
import Yandex from "next-auth/providers/yandex";
import Zitadel from "next-auth/providers/zitadel";
import Zoho from "next-auth/providers/zoho";
import Zoom from "next-auth/providers/zoom";

// Every OAuth/OIDC provider Auth.js ships, enabled purely through the
// environment — no code change for a new one. Edge-safe (plain provider
// configs, no Prisma), so `auth.config.ts` can use it for the middleware too.
//
// Left out: the mail/password/passkey providers (they aren't a "sign in with
// …" button), `azure-ad` (deprecated, `microsoft-entra-id` replaces it) and
// `netsuite` (needs an `accountID` option there's no env variable for).
//
// The order is the order of the buttons: the five providers the app has
// always had first, then alphabetical.

interface ProviderEntry {
  /** The provider's factory, handed to Auth.js uncalled: its
   *  `setEnvDefaults` calls it with `AUTH_<ID>_ID`/`_SECRET`/`_ISSUER`. */
  // biome-ignore lint/suspicious/noExplicitAny: every factory has its own options type
  factory: (options: any) => { id: string };
  /** No built-in default — a self-hosted or per-tenant IdP that only works
   *  with `AUTH_<ID>_ISSUER`. */
  issuer?: true;
}

const ENTRIES: ProviderEntry[] = [
  { factory: Github },
  { factory: Google },
  { factory: Gitlab },
  { factory: MicrosoftEntraId },
  { factory: Apple },
  { factory: School42 },
  { factory: Asgardeo, issuer: true },
  { factory: Atlassian },
  { factory: Auth0, issuer: true },
  { factory: Authentik, issuer: true },
  { factory: AzureAdB2c, issuer: true },
  { factory: AzureDevops },
  { factory: BankidNo },
  { factory: Battlenet, issuer: true },
  { factory: Beyondidentity, issuer: true },
  { factory: Bitbucket },
  { factory: Box },
  { factory: BoxyhqSaml, issuer: true },
  { factory: Bungie },
  { factory: ClickUp },
  { factory: Cognito, issuer: true },
  { factory: Coinbase },
  { factory: Concept2 },
  { factory: Descope, issuer: true },
  { factory: Discord },
  { factory: Dribbble },
  { factory: Dropbox },
  { factory: DuendeIdentityServer6, issuer: true },
  { factory: Eventbrite },
  { factory: Eveonline },
  { factory: Facebook },
  { factory: Faceit },
  { factory: Figma },
  { factory: Foursquare },
  { factory: Freshbooks },
  { factory: Frontegg, issuer: true },
  { factory: Fusionauth, issuer: true },
  { factory: Hubspot },
  { factory: Huggingface },
  { factory: IdentityServer4, issuer: true },
  { factory: Instagram },
  { factory: Kakao },
  { factory: Keycloak, issuer: true },
  { factory: Kinde, issuer: true },
  { factory: Line },
  { factory: Linkedin },
  { factory: Logto, issuer: true },
  { factory: Mailchimp },
  { factory: Mailru },
  { factory: Mastodon, issuer: true },
  { factory: Mattermost, issuer: true },
  { factory: Medium },
  { factory: Naver },
  { factory: Netlify },
  { factory: Nextcloud, issuer: true },
  { factory: Notion },
  { factory: Okta, issuer: true },
  { factory: Onelogin, issuer: true },
  { factory: OryHydra, issuer: true },
  { factory: Osso, issuer: true },
  { factory: Osu },
  { factory: Passage, issuer: true },
  { factory: Patreon },
  { factory: PingId, issuer: true },
  { factory: Pinterest },
  { factory: Pipedrive },
  { factory: Reddit },
  { factory: Roblox },
  { factory: Salesforce },
  { factory: Simplelogin },
  { factory: Slack },
  { factory: Spotify },
  { factory: Strava },
  { factory: Threads },
  { factory: Tiktok },
  { factory: Todoist },
  { factory: Trakt },
  { factory: Twitch },
  { factory: Twitter },
  { factory: UnitedEffects, issuer: true },
  { factory: Vipps },
  { factory: Vk },
  { factory: Webex },
  { factory: Wechat },
  { factory: Wikimedia },
  { factory: Wordpress },
  { factory: Workos },
  { factory: Yandex },
  { factory: Zitadel, issuer: true },
  { factory: Zoho },
  { factory: Zoom },
];

/** `AUTH_<ID>_…` prefix Auth.js reads for a provider id — uppercase, `-` → `_`
 *  (same rule as `setEnvDefaults` in `@auth/core`). */
export function providerEnvPrefix(id: string): string {
  return `AUTH_${id.toUpperCase().replace(/-/g, "_")}`;
}

/** All provider ids this registry knows, in button order. */
export const KNOWN_PROVIDER_IDS = ENTRIES.map((entry) => entry.factory({}).id);

/**
 * The providers to enable for this environment: every entry whose
 * `AUTH_<ID>_ID` and `AUTH_<ID>_SECRET` are set, plus `AUTH_<ID>_ISSUER` where
 * the provider can't work without one. A provider with credentials but no
 * required issuer is skipped with a warning instead of failing on the first
 * click.
 */
export function resolveOAuthProviders(
  env: Record<string, string | undefined>,
): { providers: Provider[]; ids: string[] } {
  const providers: Provider[] = [];
  const ids: string[] = [];
  for (const [i, entry] of ENTRIES.entries()) {
    const id = KNOWN_PROVIDER_IDS[i];
    const prefix = providerEnvPrefix(id);
    if (!env[`${prefix}_ID`] || !env[`${prefix}_SECRET`]) continue;
    if (entry.issuer && !env[`${prefix}_ISSUER`]) {
      console.warn(
        `[auth] ${prefix}_ID/_SECRET are set, but ${id} also needs ${prefix}_ISSUER — provider not enabled.`,
      );
      continue;
    }
    providers.push(entry.factory as Provider);
    ids.push(id);
  }
  return { providers, ids };
}
