import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { AUTH_PROVIDER_META } from "@/lib/auth-providers/meta";
import {
  KNOWN_PROVIDER_IDS,
  providerEnvPrefix,
  resolveOAuthProviders,
} from "@/lib/auth-providers/registry";

describe("resolveOAuthProviders", () => {
  let warn: ReturnType<typeof spyOn>;
  beforeEach(() => {
    warn = spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("enables nothing without env vars", () => {
    expect(resolveOAuthProviders({}).ids).toEqual([]);
  });

  it("needs both ID and SECRET", () => {
    expect(resolveOAuthProviders({ AUTH_DISCORD_ID: "x" }).ids).toEqual([]);
    expect(
      resolveOAuthProviders({ AUTH_DISCORD_ID: "x", AUTH_DISCORD_SECRET: "y" })
        .ids,
    ).toEqual(["discord"]);
  });

  it("keeps the original five first, in their old order", () => {
    const env: Record<string, string> = {};
    for (const id of ["slack", "apple", "github", "gitlab", "google"]) {
      env[`${providerEnvPrefix(id)}_ID`] = "x";
      env[`${providerEnvPrefix(id)}_SECRET`] = "y";
    }
    expect(resolveOAuthProviders(env).ids).toEqual([
      "github",
      "google",
      "gitlab",
      "apple",
      "slack",
    ]);
  });

  it("skips a self-hosted IdP without issuer, with a warning", () => {
    const env = { AUTH_KEYCLOAK_ID: "x", AUTH_KEYCLOAK_SECRET: "y" };
    expect(resolveOAuthProviders(env).ids).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);

    expect(
      resolveOAuthProviders({
        ...env,
        AUTH_KEYCLOAK_ISSUER: "https://kc.example.com/realms/x",
      }).ids,
    ).toEqual(["keycloak"]);
  });

  it("doesn't require an issuer for Microsoft Entra ID", () => {
    expect(
      resolveOAuthProviders({
        AUTH_MICROSOFT_ENTRA_ID_ID: "x",
        AUTH_MICROSOFT_ENTRA_ID_SECRET: "y",
      }).ids,
    ).toEqual(["microsoft-entra-id"]);
  });

  it("reads the env prefix from the provider id, not the module name", () => {
    // `next-auth/providers/ory-hydra` has the id `hydra`.
    expect(
      resolveOAuthProviders({
        AUTH_HYDRA_ID: "x",
        AUTH_HYDRA_SECRET: "y",
        AUTH_HYDRA_ISSUER: "https://hydra.example.com",
      }).ids,
    ).toEqual(["hydra"]);
  });

  it("hands Auth.js the uncalled factory, so it fills in the env itself", () => {
    const { providers } = resolveOAuthProviders({
      AUTH_GITHUB_ID: "x",
      AUTH_GITHUB_SECRET: "y",
    });
    expect(typeof providers[0]).toBe("function");
  });
});

describe("provider registry", () => {
  it("has unique ids", () => {
    expect(new Set(KNOWN_PROVIDER_IDS).size).toBe(KNOWN_PROVIDER_IDS.length);
  });

  it("has a label and icon for every provider, and nothing stale", () => {
    expect(Object.keys(AUTH_PROVIDER_META).sort()).toEqual(
      [...KNOWN_PROVIDER_IDS, "oidc"].sort(),
    );
  });

  it("lets every provider without an issuer flag work without one", () => {
    // Entries flagged `issuer: true` are skipped here — for all others the
    // config must not contain an endpoint built from a missing issuer.
    const env: Record<string, string> = {};
    for (const id of KNOWN_PROVIDER_IDS) {
      env[`${providerEnvPrefix(id)}_ID`] = "x";
      env[`${providerEnvPrefix(id)}_SECRET`] = "y";
    }
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const { providers, ids } = resolveOAuthProviders(env);
    warn.mockRestore();
    for (const [i, provider] of providers.entries()) {
      const config = (
        provider as unknown as (o: object) => Record<string, unknown>
      )({});
      if (ids[i] === "microsoft-entra-id") continue; // falls back to /common/
      const serialized = JSON.stringify(config);
      expect({ id: ids[i], broken: serialized.includes("undefined") }).toEqual({
        id: ids[i],
        broken: false,
      });
      if (config.type === "oidc") {
        expect({ id: ids[i], issuer: Boolean(config.issuer) }).toEqual({
          id: ids[i],
          issuer: true,
        });
      }
    }
  });
});
