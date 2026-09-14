# barynt (Helm-Chart)

Rollt dieselben Images aus, die `docker-compose.yml` auf einem
Single-Host-Deployment fährt (`ghcr.io/jafoson/barynt` +
`ghcr.io/jafoson/barynt-migrate`), für einen Kubernetes-Cluster. Siehe
BARY-22.

## Schnellstart

Das Chart liegt als öffentliches OCI-Artefakt auf GHCR (`Helm Release`,
`.github/workflows/helm-release.yml`, manuell ausgelöst) — ohne Checkout
dieses Repos reicht:

```sh
helm install barynt oci://ghcr.io/jafoson/charts/barynt --version 0.1.0 \
  -n barynt --create-namespace
kubectl port-forward -n barynt svc/barynt 3000:80
```

Kein `helm repo add` nötig — `helm install oci://...` spricht die Registry
direkt an (Helm ≥ 3.8). Ohne veröffentlichtes Release, oder für lokale
Änderungen an den Templates, aus dem Checkout heraus:

```sh
helm install barynt ./deploy/helm/barynt -n barynt --create-namespace
kubectl port-forward -n barynt svc/barynt 3000:80
```

Bündelt standardmäßig alles (Postgres, Redis, RustFS als S3-Ersatz) — kein
externer Zugangsdaten-Kram nötig, um es einmal laufen zu sehen. `AUTH_SECRET`
wird beim ersten Install automatisch generiert (siehe „Secrets" unten).

Für einen echten Cluster: `examples/values-production.yaml` (externe
DB/Redis/S3, Ingress+TLS) als Ausgangspunkt nehmen.

## Architektur — Zuordnung zu docker-compose.yml

| Compose-Service     | Hier                                             |
| -------------------- | ------------------------------------------------ |
| `app`                 | `Deployment` + `Service` (+ optional `Ingress`, `HPA`) |
| `migrate`             | initContainer auf dem App-Pod (siehe unten, **nicht** als Hook-Job) |
| `postgres`            | eigene `StatefulSet` (`postgresql.enabled`) oder `externalDatabase.*` |
| `redis`               | eigene `StatefulSet` (`redis.enabled`) oder `externalRedis.*` |
| `rustfs`/`rustfs-init` | eigenes `Deployment`+`PVC` (`rustfs.enabled`), Bucket/CORS-Setup als initContainer |
| `caddy`               | entfällt — `Ingress` + cert-manager übernehmen automatisches HTTPS |

## Warum Migrationen als initContainer, nicht als Helm-Hook-Job

Der naheliegende Standard-Pattern für DB-Migrationen in Helm ist ein
`pre-install,pre-upgrade`-Hook-Job. Das funktioniert sauber, **solange die
Datenbank nicht Teil desselben Charts ist** — bei uns per Default aber
schon (`postgresql.enabled: true`). Ein `pre-install`-Hook läuft *vor* allen
normalen Chart-Ressourcen; bei der allerersten Installation gäbe es die
Postgres-`StatefulSet` zu dem Zeitpunkt noch gar nicht, der Hook liefe gegen
eine nicht existierende Datenbank.

Migrationen laufen deshalb als initContainer auf dem App-Pod selbst (Image:
`barynt-migrate`, Befehl unverändert: `bun prisma migrate deploy && bun
prisma/bootstrap.ts`, mit kurzer TCP-Warteschleife davor). Das ist sicher,
weil beide Befehle idempotent/nebenläufig-sicher sind — `prisma migrate
deploy` nimmt eine Advisory-Lock, `bootstrap.ts` nutzt `skipDuplicates` —,
läuft also unbeschadet mehrfach (mehrere Replicas, jeder Rollout), ohne die
Hook-Ordnungsproblematik gegen eine gebündelte Datenbank zu haben.

## Warum keine Bitnami-Subcharts für Postgres/Redis

Naheliegend wäre gewesen, Postgres/Redis als optionale Bitnami-Subcharts
einzubinden. Seit September 2025 liegen die meisten Bitnami-Charts aber
hinter einer kommerziellen Broadcom-Subscription; ein etablierter freier
Nachfolger (z. B. der Valkey-Chart als Redis-Ersatz) hatte sich zum
Zeitpunkt dieser Implementierung noch nicht als neuer Standard gefestigt.
Für eine Single-Instance-Datenbank ohne Hochverfügbarkeitsanspruch —
dieselbe Erwartung, die das bestehende `docker-compose.yml` auch hat —
reichen eigene, minimale `StatefulSet`-Templates, ohne Abhängigkeit von
einem Chart-Repository, das gerade im Umbruch ist.

## Secrets

Nichts Sensibles landet in `values.yaml`. Für jeden Zugangsdaten-Typ gilt
das `existingSecret`-Pattern: ein Name+Key eines bereits vorhandenen
Kubernetes-Secrets.

| Wert           | Values-Feld                              | Ohne Angabe                                              |
| --------------- | ----------------------------------------- | --------------------------------------------------------- |
| `AUTH_SECRET`   | `auth.existingSecret`/`existingSecretKey` | wird einmalig generiert, bleibt über Upgrades stabil       |
| Postgres-Passwort (gebündelt) | `postgresql.auth.existingSecret`/`existingSecretPasswordKey` | wird einmalig generiert, bleibt über Upgrades stabil |
| `DATABASE_URL`  | `externalDatabase.existingSecret`/`existingSecretUrlKey` | gebündelte Postgres-Instanz, Passwort ebenfalls generiert |
| S3-Zugangsdaten | `s3.existingSecret` (+`*Key`-Felder)      | gebündelte RustFS-Instanz, Zugangsdaten generiert          |
| `SMTP_PASS`     | `smtp.existingSecret`/`existingSecretKey` | keins — SMTP bleibt ohne `smtp.host` komplett aus          |

Generierte Werte landen in einem einzigen Secret,
`<release>-barynt-generated`, per `lookup` über `helm upgrade` hinweg
stabil (kein neues Passwort bei jedem Rollout). Ein `helm template`/`--dry-run`
ohne Cluster-Zugriff kann `lookup` nicht ausführen und generiert in dem Fall
frisch — für Lint/CI ausreichend, aber kein Vorschauwert für einen echten
Cluster.

`postgresql.auth.existingSecret` ist kein Ersatz für `externalDatabase.*`,
sondern dieselbe gebündelte Postgres-Instanz mit einem vorgegebenen statt
generierten Passwort — der Postgres-Container liest es direkt aus diesem
Secret, `DATABASE_URL` (in `<release>-barynt-generated`) wird per `lookup`
mit dem Klartext-Wert zusammengesetzt, da Prisma eine fertige URL braucht.

**Unter ArgoCD/Flux**: ein per `randAlphaNum` generierter Wert führt laut
ArgoCDs eigener Doku dazu, dass die Anwendung dauerhaft als `OutOfSync`
angezeigt wird (`user-guide/helm`); `nautobot/helm-charts#679` musste eine
`lookup`-basierte Secret-Validierung deshalb wieder zurücknehmen. Für einen
GitOps-Betrieb daher **alle** `existingSecret`-Felder setzen (`auth.*`,
`postgresql.auth.*`, `s3.*`, `smtp.*`) statt sich auf die generierten Werte
zu verlassen.

## Externe Datenbank/Redis/S3

```yaml
postgresql:
  enabled: false
externalDatabase:
  existingSecret: barynt-db
  existingSecretUrlKey: url # Secret muss die fertige DATABASE_URL enthalten

redis:
  enabled: false
externalRedis:
  host: redis.example.com

rustfs:
  enabled: false
s3:
  endpoint: "https://s3.eu-central-1.amazonaws.com"
  existingSecret: barynt-s3 # Keys: accessKeyId, secretAccessKey
```

Siehe `examples/values-production.yaml` für ein vollständiges Beispiel.

## SSO/OIDC

Ein generischer OIDC-Provider (Keycloak, Authentik, Entra ID, Okta, ...) —
siehe `auth.config.ts` und `example.env` `AUTH_OIDC_*`:

```yaml
auth:
  oidc:
    issuer: "https://idp.example.com"
    clientId: "barynt"
    name: "Company SSO" # nur das Button-Label, Default "SSO"
    existingSecret: barynt-oidc # kubectl create secret generic barynt-oidc -n barynt --from-literal=clientSecret=...
    existingSecretKey: clientSecret
```

Ohne `issuer`/`clientId` bleibt der Button aus, genau wie ohne die Env-Vars
außerhalb von Helm. Das Client-Secret wird nie generiert (externer IdP) —
nur per `existingSecret` referenziert, landet nie in der ConfigMap. Die
Callback-URI ist `<AUTH_URL>/api/auth/callback/oidc` — `oidc` ist die feste
Provider-ID aus `auth.config.ts`, nicht `auth.oidc.name` (nur das
Button-Label).

Registrierung/Passkeys lassen sich unabhängig davon abschalten (Default:
alles offen, wie ohne Helm):

```yaml
auth:
  registrationEnabled: false # Invite-only, siehe example.env AUTH_REGISTRATION_ENABLED
  passkeyLoginEnabled: false # WARNUNG: ohne OIDC/SMTP kommt dann niemand mehr rein
  passkeyRegistrationEnabled: false
```

## Generische Erweiterungen (`extraEnv`, `extraVolumes`, `hostAliases`, ...)

Für alles, was der Chart nicht explizit abbildet — ein interner
CA-Trust-Anchor, ein Split-Horizon-DNS-Eintrag für einen internen IdP,
eine zusätzliche App-Env-Var — ohne dafür einen Chart-Release zu brauchen:

```yaml
extraEnv:
  - name: NODE_EXTRA_CA_CERTS
    value: /etc/ssl/custom/ca.crt
extraEnvFrom:
  - secretRef:
      name: some-extra-secret
extraVolumes:
  - name: custom-ca
    secret:
      secretName: internal-ca
extraVolumeMounts:
  - name: custom-ca
    mountPath: /etc/ssl/custom
    readOnly: true
hostAliases:
  - ip: "10.0.0.5"
    hostnames:
      - "idp.internal.example.com"
```

`extraEnv`/`extraEnvFrom`/`extraVolumeMounts` landen am App-Container,
`extraVolumes`/`hostAliases` am App-Pod — unverändert durchgereicht, keine
Chart-seitige Sonderlogik.

## Pod Security Standard "restricted"

Läuft standardmäßig gegen einen Namespace mit
`pod-security.kubernetes.io/enforce=restricted` (Cilium/Gateway-API-Cluster
o.ä.). Jeder Container (App, `migrate`-initContainer, `rustfs-init`,
Postgres, Redis, RustFS) startet `runAsNonRoot`, ohne
`allowPrivilegeEscalation`, mit `capabilities.drop: ["ALL"]` und
`seccompProfile.type: RuntimeDefault`.

Postgres/Redis/RustFS laufen dafür direkt als der jeweils im Image fest
eingebaute Service-User (`postgresql.podSecurityContext`/`.securityContext`,
analog `redis.*`/`rustfs.*` in `values.yaml`) statt wie ohne Restricted-PSS
üblich als root mit anschließendem Wechsel im Image-Entrypoint — die
UID/GID je Image per `docker run --rm --entrypoint id <image>` geprüft,
nicht geraten:

| Image                     | UID/GID     |
| ------------------------- | ----------- |
| `postgres:17-alpine`      | 70 / 70     |
| `redis:7-alpine`          | 999 / 1000  |
| `rustfs/rustfs:latest`    | 10001/10001 |
| `amazon/aws-cli:latest` (`rustfs-init`) | beliebig, läuft unter jeder Nicht-root-UID — bekommt denselben Container-`securityContext` wie App/`migrate` (uid/gid 1000) |

Abnahme in einem echten Cluster (kind reicht):

```sh
kubectl create ns barynt-pss
kubectl label ns barynt-pss \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
helm install barynt ./deploy/helm/barynt -n barynt-pss --wait
helm test barynt -n barynt-pss
kubectl get events -n barynt-pss | grep -i "violat\|forbidden"
```

Läuft auch automatisiert in CI, siehe `.github/workflows/helm-lint.yml`
(Job `restricted-pss`, kind-Cluster).

## Versionierung

Chart-Version (`Chart.yaml: version`, SemVer) und `appVersion` sind getrennte
Zähler. `image.app.tag`/`image.migrate.tag` fallen auf `appVersion` zurück,
wenn leer — in Produktion trotzdem explizit auf einen Commit-SHA oder
Release-Tag pinnen statt `latest`, für reproduzierbare Rollouts/Rollbacks.

## Chart veröffentlichen

`Chart.yaml`s `version` erhöhen, committen, dann in GitHub Actions
`Helm Release` manuell auslösen (`gh workflow run helm-release.yml`, analog
zu `Docker Build`) — packt das Chart und pusht es als OCI-Artefakt nach
`oci://ghcr.io/jafoson/charts/barynt`. Das Package ist direkt nach dem
ersten Push öffentlich pullbar (getestet per anonymem `helm pull`, ohne
`helm registry login`) — kein manueller Sichtbarkeits-Schritt nötig.

## Testen

```sh
helm lint ./deploy/helm/barynt
helm template barynt ./deploy/helm/barynt | kubeconform -strict -summary
helm template barynt ./deploy/helm/barynt -f examples/values-production.yaml | kubeconform -strict -summary
helm install barynt ./deploy/helm/barynt -n barynt --create-namespace --wait
helm test barynt -n barynt
```

Alle drei laufen auch in CI, siehe `.github/workflows/helm-lint.yml`.
