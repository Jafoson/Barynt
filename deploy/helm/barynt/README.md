# barynt (Helm-Chart)

Rollt dieselben Images aus, die `docker-compose.yml` auf einem
Single-Host-Deployment fährt (`ghcr.io/jafoson/barynt` +
`ghcr.io/jafoson/barynt-migrate`), für einen Kubernetes-Cluster. Siehe
BARY-22.

## Schnellstart

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
| `DATABASE_URL`  | `externalDatabase.existingSecret`/`existingSecretUrlKey` | gebündelte Postgres-Instanz, Passwort ebenfalls generiert |
| S3-Zugangsdaten | `s3.existingSecret` (+`*Key`-Felder)      | gebündelte RustFS-Instanz, Zugangsdaten generiert          |
| `SMTP_PASS`     | `smtp.existingSecret`/`existingSecretKey` | keins — SMTP bleibt ohne `smtp.host` komplett aus          |

Generierte Werte landen in einem einzigen Secret,
`<release>-barynt-generated`, per `lookup` über `helm upgrade` hinweg
stabil (kein neues Passwort bei jedem Rollout). Ein `helm template`/`--dry-run`
ohne Cluster-Zugriff kann `lookup` nicht ausführen und generiert in dem Fall
frisch — für Lint/CI ausreichend, aber kein Vorschauwert für einen echten
Cluster.

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

## Versionierung

Chart-Version (`Chart.yaml: version`, SemVer) und `appVersion` sind getrennte
Zähler. `image.app.tag`/`image.migrate.tag` fallen auf `appVersion` zurück,
wenn leer — in Produktion trotzdem explizit auf einen Commit-SHA oder
Release-Tag pinnen statt `latest`, für reproduzierbare Rollouts/Rollbacks.

## Testen

```sh
helm lint ./deploy/helm/barynt
helm template barynt ./deploy/helm/barynt | kubeconform -strict -summary
helm template barynt ./deploy/helm/barynt -f examples/values-production.yaml | kubeconform -strict -summary
helm install barynt ./deploy/helm/barynt -n barynt --create-namespace --wait
helm test barynt -n barynt
```

Alle drei laufen auch in CI, siehe `.github/workflows/helm-lint.yml`.
