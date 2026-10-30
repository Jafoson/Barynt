---
title: "Kubernetes (Helm)"
description: "Dasselbe Image auf Kubernetes. Das Chart liegt als öffentliches OCI-Artefakt auf GHCR, ein Repository musst du nicht hinzufügen."
sidebar:
  order: 7
---

## Schnellstart

```bash
Helm install barynt oci://ghcr.io/jafoson/charts/barynt --version {{version}} \
  -n barynt --create-namespace
kubectl port-forward -n barynt svc/barynt 3000:80
```

Standardmäßig bringt das Chart Postgres, Redis und RustFS als S3 mit, es läuft also ganz ohne externe Zugangsdaten. `AUTH_SECRET` wird bei der ersten Installation erzeugt. Helm 3.8 oder neuer braucht es für `oci://`.

## Für die Produktion

- Externe Datenbank, Redis und S3 statt der mitgelieferten
- Ingress mit TLS über cert-manager, dazu ein zweiter Ingress für hochgeladene Dateien
- Pod Disruption Budget, Scheduling-Regeln und Network Policies
- Geplante Backups des mitgelieferten Postgres

Starte mit `examples/values-production.yaml` im Chart.

## Migrationen

Die App migriert die Datenbank beim Start, ein Update ist also nur ein anderer Image-Tag. Eine Startup-Probe hält den Traffic zurück, solange Migrationen laufen.
