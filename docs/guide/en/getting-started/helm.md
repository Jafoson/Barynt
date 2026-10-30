---
title: "Kubernetes (Helm)"
description: "The same image on Kubernetes. The chart is published as a public OCI artifact on GHCR, so you don't need to add a repository."
sidebar:
  order: 7
---

## Quick start

```bash
helm install barynt oci://ghcr.io/barynt-dev/charts/barynt --version {{version}} \
  -n barynt --create-namespace
kubectl port-forward -n barynt svc/barynt 3000:80
```

By default the chart bundles Postgres, Redis and RustFS for S3, so it runs without any outside credentials. `AUTH_SECRET` is generated on the first install. Helm 3.8 or newer is needed for `oci://`.

## For production

- External database, Redis and S3 instead of the bundled ones
- Ingress with TLS through cert-manager, plus a second ingress for uploaded files
- Pod disruption budget, scheduling rules and network policies
- Scheduled backups of the bundled Postgres

Start from `examples/values-production.yaml` in the chart.

## Migrations

The app migrates the database when it starts, so an update is just another image tag. A startup probe holds back traffic while migrations run.
