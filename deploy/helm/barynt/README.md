# barynt (Helm-Chart)

Rollt dasselbe Image aus, das `docker-compose.yml` auf einem
Single-Host-Deployment fährt (`ghcr.io/barynt-dev/barynt`), für einen
Kubernetes-Cluster. Das Image migriert die Datenbank beim Start selbst. Siehe
BARY-22.

## Schnellstart

Das Chart liegt als öffentliches OCI-Artefakt auf GHCR (`Helm Release`,
`.github/workflows/helm-release.yml`, manuell ausgelöst) — ohne Checkout
dieses Repos reicht:

```sh
helm install barynt oci://ghcr.io/barynt-dev/charts/barynt --version 1.0.0 \
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
| `postgres`            | eigene `StatefulSet` (`postgresql.enabled`) oder `externalDatabase.*` |
| `redis`               | eigene `StatefulSet` (`redis.enabled`) oder `externalRedis.*` |
| `rustfs`/`rustfs-init` | eigenes `Deployment`+`PVC` (`rustfs.enabled`), Bucket/CORS-Setup als initContainer |
| `caddy`               | entfällt — `Ingress` + cert-manager übernehmen automatisches HTTPS |

## Migrationen: der App-Container migriert beim Start selbst

Es gibt weder ein Migrate-Image noch einen Hook-Job oder initContainer dafür.
Das App-Image führt beim Start `prisma migrate deploy && bun
prisma/bootstrap.ts` aus (`docker/entrypoint.sh`), bevor der Server hochfährt —
ein Update ist nur ein anderes Image-Tag. Ein `pre-install`-Hook-Job kam nicht
in Frage: Er läuft vor allen normalen Chart-Ressourcen, bei der allerersten
Installation existierte die gebündelte Postgres-`StatefulSet` noch gar nicht.

Das ist sicher, weil beide Befehle idempotent/nebenläufig-sicher sind —
`prisma migrate deploy` nimmt eine Advisory-Lock, `bootstrap.ts` nutzt
`skipDuplicates` —, läuft also unbeschadet mehrfach (mehrere Replicas, jeder
Rollout). Der `startupProbe` der App (`probes.startup*`, Standard 5 Minuten)
hält Liveness/Readiness zurück, solange noch migriert wird. Wird die Datenbank
anderswo migriert, setzt man `MIGRATE_ON_START=false` per `extraEnv`;
`MIGRATE_DATABASE_URL` nimmt einen Datenbank-User mit Schema-Rechten.

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

`postgresql.auth.existingSecret` setzt **nur** das Passwort des gebündelten
Postgres-Containers selbst — ein reiner Verweis (`secretKeyRef`), kein
`lookup`. Es landet bewusst **nicht** automatisch in `DATABASE_URL`: eine
daraus zusammengesetzte URL bräuchte den Klartext-Wert zur Render-Zeit, und
unter GitOps (ArgoCD/Flux rendern immer per `helm template`, nie mit
Cluster-Zugriff) ist `lookup` dort **immer** leer — das würde das Rendern
selbst brechen, nicht nur die Rotation (genau das war ein früherer, seither
korrigierter Fehler in diesem Chart). Wer der gebündelten Instanz ein
eigenes Passwort geben will, muss deshalb zusätzlich
`externalDatabase.existingSecret`/`existingSecretUrlKey` setzen und die
fertige `DATABASE_URL` (mit demselben Passwort) selbst mitbringen — der
Chart komponiert sie dann gar nicht mehr. Ohne das bricht `helm template`
mit einer klaren Fehlermeldung statt einer kaputten URL:

```yaml
postgresql:
  enabled: true # gebündelte Instanz bleibt
  auth:
    existingSecret: barynt-db # Postgres-Container liest sein Passwort hier
    existingSecretPasswordKey: password

externalDatabase:
  existingSecret: barynt-db # dasselbe Secret, zweiter Key
  existingSecretUrlKey: url # postgresql://barynt:<gleiches-passwort>@<release>-barynt-postgres:5432/barynt
```

**Unter ArgoCD/Flux**: ein per `randAlphaNum` generierter Wert führt laut
ArgoCDs eigener Doku dazu, dass die Anwendung dauerhaft als `OutOfSync`
angezeigt wird (`user-guide/helm`); `nautobot/helm-charts#679` musste eine
`lookup`-basierte Secret-Validierung deshalb wieder zurücknehmen. Für einen
GitOps-Betrieb daher **alle** `existingSecret`-Felder setzen (`auth.*`,
`postgresql.auth.*` + `externalDatabase.*` zusammen, `s3.*`, `smtp.*`)
statt sich auf die generierten Werte zu verlassen — und den GitOps-Vertrag
vor jedem Release gegenprüfen, ganz ohne Cluster:

```sh
helm template barynt deploy/helm/barynt \
  --set auth.existingSecret=x --set s3.existingSecret=y \
  --set postgresql.auth.existingSecret=z --set externalDatabase.existingSecret=z \
  --set externalDatabase.existingSecretUrlKey=url >/dev/null
```

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

Jede der drei gebündelten Komponenten (`postgresql`, `redis`, `rustfs`)
lässt sich unabhängig von den anderen abschalten — z. B. eine eigene S3-
Bucket nutzen, aber die gebündelte Postgres/Redis-Instanz behalten. Der
Chart validiert die dafür nötige Gegenstelle zur Render-Zeit (reiner
Werte-Check, kein Cluster-Zugriff nötig, feuert also auch unter GitOps
deterministisch): `redis.enabled: false` verlangt `externalRedis.host`,
und ein konfigurierter `s3.endpoint` ohne laufendes `rustfs` verlangt
`s3.existingSecret` — sonst bricht `helm template` mit einer klaren
Meldung statt eines `CreateContainerConfigError` erst beim Rollout.

## Datei-Uploads (gebündeltes RustFS)

Der Browser lädt Avatare und Anhänge über vorsignierte URLs direkt in den
Speicher, nicht über die App. Die Signatur gilt für Host und Pfad — RustFS
braucht deshalb einen eigenen Host, keinen Pfad unter `ingress.host`:

```yaml
ingress:
  enabled: true
  host: issues.example.com
  filesHost: files.issues.example.com
  tls:
    enabled: true
```

Damit bekommt RustFS einen eigenen Ingress (`<release>-files`, mit denselben
`ingress.annotations`, z. B. dem cert-manager-Issuer, plus
`ingress.filesAnnotations`), und `S3_PUBLIC_ENDPOINT` zeigt automatisch auf
`https://files.issues.example.com`. Bei `className: nginx` setzt der Chart
`proxy-body-size: 100m`, nginx' Standard (1 MB) würde Anhänge abweisen.
Ohne `filesHost` funktionieren Browser-Uploads nur, wenn `s3.publicEndpoint`
anderweitig von außen erreichbar ist. Bei externem S3 (`rustfs.enabled:
false`) ist das ohnehin der Fall.

## Produktionsbausteine

| Wert | Standard | Wofür |
| --- | --- | --- |
| `podDisruptionBudget` | an, `minAvailable: 1` | Bei Node-Drain/Cluster-Upgrade bleibt eine App-Replica am Leben. Nur bei mehr als einer Replica oder HPA. |
| `topologySpreadConstraints` | leer → weich nach Node verteilt | App-Replicas auf verschiedene Nodes (`ScheduleAnyway`); eigene Regeln ersetzen den Standard. |
| `nodeSelector`, `tolerations`, `priorityClassName` | leer | Gelten für alle Pods des Charts, auch Postgres/Redis/RustFS/Backup. |
| `affinity` | leer | Nur die App. |
| `imagePullSecrets` | leer | Private Spiegel, z. B. `[{ name: regcred }]`, für alle Pods. |
| `image.app.digest` | leer | `sha256:…` pinnt unveränderlich, hat Vorrang vor `tag`. |
| `networkPolicy.enabled` | aus | Postgres/Redis nur von der App (Postgres auch vom Backup), RustFS nur von der App bzw. über den Files-Ingress. `networkPolicy.appFrom` schränkt ein, wer die App erreicht. Ausgehend bleibt offen. Braucht ein CNI mit NetworkPolicy-Support. |
| `podLabels` | leer | Zusätzliche Labels an den App-Pods. |

Eine geänderte Konfiguration rollt die App-Pods automatisch neu aus
(`checksum/config`), ein `helm upgrade --set …` braucht also keinen
manuellen Neustart mehr.

## Backup

```yaml
backup:
  enabled: true
  schedule: "0 3 * * *" # täglich 03:00 UTC
  keep: 7 # die neuesten 7 bleiben
  persistence:
    size: 10Gi
```

Ein CronJob sichert die gebündelte Postgres-Datenbank per `pg_dump -Fc` auf
ein eigenes Volume (`<release>-backup`, mit `helm.sh/resource-policy: keep`,
übersteht also `helm uninstall`). Der Postgres-Pod bindet dieses Volume
selbst (lesend unter `/backups`), der Job läuft per Pod-Affinity auf
demselben Node. So ist es auch bei `WaitForFirstConsumer`-StorageClasses
sofort gebunden, und `helm install --wait` wartet nicht bis zur ersten
Sicherung. Läuft als Postgres-User unter restricted PSS. Für eine externe
Datenbank sichert man dort, wo sie läuft; RustFS-Daten (Anhänge) deckt der
Job nicht ab, die liegen im RustFS-Volume.

Sofort sichern und wiederherstellen:

```sh
# Jetzt eine Sicherung anstoßen
kubectl create job backup-now --from=cronjob/barynt-backup -n barynt

# Vorhandene Sicherungen ansehen
kubectl exec -n barynt barynt-postgres-0 -- ls -lh /backups

# Wiederherstellen: App anhalten, Dump einspielen, App wieder starten
kubectl scale deploy/barynt -n barynt --replicas=0
kubectl exec -n barynt barynt-postgres-0 -- \
  pg_restore -U barynt -d barynt --clean --if-exists --no-owner /backups/barynt-20261028-030000.dump
kubectl scale deploy/barynt -n barynt --replicas=2
```

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

**Beim Wechsel des IdP** (z. B. authentik → Keycloak) liefert der neue IdP
pro Person eine andere `sub`. Die bestehende Verknüpfung passt dann nicht
mehr, und der Login scheitert mit `OAuthAccountNotLinked`. Abhilfe:
`auth.oidc.allowEmailLinking: true` (`AUTH_OIDC_ALLOW_EMAIL_LINKING`). Damit
wird ein unbekannter OIDC-Login mit dem bestehenden Konto derselben E-Mail
verknüpft. Standard ist aus. Nur einschalten, wenn der IdP die Adressen
verlässlich verifiziert (Admins pflegen sie, keine Selbstregistrierung),
denn wer dort eine Adresse kontrolliert, bekommt das Barynt-Konto dazu. Der
Schalter kann auch nur für die Umstellung an bleiben: Wer sich einmal
angemeldet hat, ist dauerhaft mit der neuen `sub` verknüpft.

Jeder andere OAuth-/OIDC-Provider, den Auth.js mitbringt (Discord, Slack,
Keycloak, Okta, ...), schaltet sich über seine Env-Vars ein:
`AUTH_<ID>_ID`, `AUTH_<ID>_SECRET` und, bei selbst gehosteten IdPs,
`AUTH_<ID>_ISSUER` (siehe `example.env`). Der Chart bildet sie nicht
einzeln ab, sie kommen über `extraEnv`/`extraEnvFrom`, das Secret aus einem
eigenen Secret:

```yaml
extraEnv:
  - name: AUTH_DISCORD_ID
    value: "123456789"
  - name: AUTH_DISCORD_SECRET
    valueFrom:
      secretKeyRef:
        name: barynt-discord
        key: clientSecret
```

Callback-URI: `<AUTH_URL>/api/auth/callback/<id>`.

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

`extraEnv`/`extraEnvFrom`/`extraVolumeMounts` landen auf allen Containern
des Pods (App, `rustfs-init`) — unverändert durchgereicht, keine
Chart-seitige Sonderlogik. Beide sprechen dasselbe Netz bzw. denselben
Endpunkt an und brauchen deshalb praktisch immer dieselbe Konfiguration, z. B. einen
internen CA-Trust-Anchor per `NODE_EXTRA_CA_CERTS` gegen ein Postgres mit
selbstsigniertem Zertifikat. `extraVolumes`/`hostAliases` landen ohnehin am
App-Pod und gelten damit schon für alle Container.

## Pod Security Standard "restricted"

Läuft standardmäßig gegen einen Namespace mit
`pod-security.kubernetes.io/enforce=restricted` (Cilium/Gateway-API-Cluster
o.ä.). Jeder Container (App, `rustfs-init`,
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
| `amazon/aws-cli:latest` (`rustfs-init`) | beliebig, läuft unter jeder Nicht-root-UID — bekommt denselben Container-`securityContext` wie die App (uid/gid 1000) |

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
Zähler (sie laufen gleich: Chart `1.0.0`, `appVersion` `"1.0.0"`).
`image.app.tag` fällt auf `appVersion` zurück, wenn leer — in Produktion
trotzdem explizit auf ein Release pinnen (z. B. `1.0.0`, kein `v`-Präfix)
statt `latest`, für reproduzierbare Rollouts/Rollbacks.

## Chart veröffentlichen

`Chart.yaml`s `version` erhöhen, committen, dann in GitHub Actions
`Helm Release` manuell auslösen (`gh workflow run helm-release.yml`, analog
zu `Docker Build`) — packt das Chart und pusht es als OCI-Artefakt nach
`oci://ghcr.io/barynt-dev/charts/barynt`. Das Package ist direkt nach dem
ersten Push öffentlich pullbar (getestet per anonymem `helm pull`, ohne
`helm registry login`) — kein manueller Sichtbarkeits-Schritt nötig.

## Testen

```sh
helm lint ./deploy/helm/barynt
helm template barynt ./deploy/helm/barynt | kubeconform -strict -summary
helm template barynt ./deploy/helm/barynt -f examples/values-production.yaml | kubeconform -strict -summary
helm install barynt ./deploy/helm/barynt -n barynt --create-namespace --wait
helm test barynt -n barynt

# Template-Tests ohne Cluster (unittests/, Plugin helm-unittest)
helm plugin install https://github.com/helm-unittest/helm-unittest --version v1.0.3
helm unittest -f 'unittests/*_test.yaml' ./deploy/helm/barynt
```

Alles davon läuft auch in CI (`.github/workflows/helm-lint.yml`), dazu ein
Render-Durchlauf mit allen optionalen Funktionen und im kind-Cluster ein
echter Backup-Lauf mit aktiven NetworkPolicies.
