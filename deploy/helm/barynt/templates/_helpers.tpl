{{/*
Chart-Name, ggf. per nameOverride gekappt auf 63 Zeichen (DNS-Label-Limit).
*/}}
{{- define "barynt.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Voller Ressourcenname. Enthält den Release-Namen, außer der Chart-Name
selbst schon damit anfängt (Standard-Helm-Idiom aus `helm create`).
*/}}
{{- define "barynt.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "barynt.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Empfohlene Kubernetes-Labels (app.kubernetes.io/*, siehe
kubernetes.io/docs/concepts/overview/working-with-objects/common-labels).
*/}}
{{- define "barynt.labels" -}}
helm.sh/chart: {{ include "barynt.chart" . }}
{{ include "barynt.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.app.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "barynt.selectorLabels" -}}
app.kubernetes.io/name: {{ include "barynt.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "barynt.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "barynt.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Name des einmalig generierten Secrets (AUTH_SECRET, DATABASE_URL,
Postgres-/RustFS-Zugangsdaten — nur die Felder, für die keine eigene
existingSecret-Referenz gesetzt wurde, siehe templates/secret-generated.yaml).
*/}}
{{- define "barynt.generatedSecretName" -}}
{{- printf "%s-generated" (include "barynt.fullname" .) -}}
{{- end -}}

{{/* AUTH_SECRET: existingSecret hat Vorrang vor dem generierten Secret. */}}
{{- define "barynt.authSecretRef" -}}
{{- if .Values.auth.existingSecret -}}
name: {{ .Values.auth.existingSecret }}
key: {{ .Values.auth.existingSecretKey | default "AUTH_SECRET" }}
{{- else -}}
name: {{ include "barynt.generatedSecretName" . }}
key: AUTH_SECRET
{{- end -}}
{{- end -}}

{{/*
POSTGRES_PASSWORD für den gebündelten Postgres-Container selbst:
existingSecret hat Vorrang vor dem generierten Secret. Getrennt von
barynt.databaseUrlRef, weil der Postgres-Container das rohe Passwort
braucht (nicht die zusammengesetzte URL) und, bei existingSecret, direkt
aus dem Secret des Betreibers lesen soll statt aus einer Kopie. Reiner
Verweis, kein `lookup` — deshalb unter GitOps unproblematisch, anders als
der Versuch, daraus eine DATABASE_URL zusammenzusetzen (siehe
templates/secret-generated.yaml und README "Secrets": dafür ist zusätzlich
externalDatabase.existingSecret/existingSecretUrlKey Pflicht).
*/}}
{{- define "barynt.postgresPasswordRef" -}}
{{- if .Values.postgresql.auth.existingSecret -}}
name: {{ .Values.postgresql.auth.existingSecret }}
key: {{ .Values.postgresql.auth.existingSecretPasswordKey | default "password" }}
{{- else -}}
name: {{ include "barynt.generatedSecretName" . }}
key: POSTGRES_PASSWORD
{{- end -}}
{{- end -}}

{{/*
DATABASE_URL: eine fertige externe Verbindungs-URL (existingSecret +
existingSecretUrlKey) hat Vorrang vor der gebündelten Postgres-Instanz, für
die der Chart die URL selbst zusammensetzt und im generierten Secret ablegt
(siehe templates/secret-generated.yaml).
*/}}
{{- define "barynt.databaseUrlRef" -}}
{{- if .Values.externalDatabase.existingSecretUrlKey -}}
name: {{ .Values.externalDatabase.existingSecret }}
key: {{ .Values.externalDatabase.existingSecretUrlKey }}
{{- else -}}
name: {{ include "barynt.generatedSecretName" . }}
key: DATABASE_URL
{{- end -}}
{{- end -}}

{{/* S3 Access Key ID: existingSecret hat Vorrang vor der gebündelten RustFS-Instanz. */}}
{{- define "barynt.s3AccessKeyRef" -}}
{{- if .Values.s3.existingSecret -}}
name: {{ .Values.s3.existingSecret }}
key: {{ .Values.s3.existingSecretAccessKeyIdKey | default "accessKeyId" }}
{{- else -}}
name: {{ include "barynt.generatedSecretName" . }}
key: S3_ACCESS_KEY_ID
{{- end -}}
{{- end -}}

{{- define "barynt.s3SecretKeyRef" -}}
{{- if .Values.s3.existingSecret -}}
name: {{ .Values.s3.existingSecret }}
key: {{ .Values.s3.existingSecretSecretAccessKeyKey | default "secretAccessKey" }}
{{- else -}}
name: {{ include "barynt.generatedSecretName" . }}
key: S3_SECRET_ACCESS_KEY
{{- end -}}
{{- end -}}

{{/* S3_ENDPOINT: expliziter Wert hat Vorrang, sonst die gebündelte RustFS-Instanz. */}}
{{- define "barynt.s3Endpoint" -}}
{{- if .Values.s3.endpoint -}}
{{- .Values.s3.endpoint -}}
{{- else if .Values.rustfs.enabled -}}
{{- printf "http://%s-rustfs:%v" (include "barynt.fullname" .) .Values.rustfs.service.apiPort -}}
{{- else -}}
{{- "" -}}
{{- end -}}
{{- end -}}

{{/* REDIS_URL: externalRedis.host hat Vorrang vor der gebündelten Instanz. */}}
{{- define "barynt.redisUrl" -}}
{{- if .Values.externalRedis.host -}}
{{- printf "redis://%s:%v" .Values.externalRedis.host .Values.externalRedis.port -}}
{{- else -}}
{{- printf "redis://%s-redis:6379" (include "barynt.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
Gemeinsame Pod-Felder aller Pods des Charts: Pull-Secrets für private
Registries und die Planung auf Nodes (nodeSelector, tolerations,
priorityClassName). Hängt an App, Postgres, Redis, RustFS, Backup-Job und
Test-Pod gleichermaßen — sonst landen die gebündelten Dienste auf Nodes, auf
die die App nie darf. Leer, wenn nichts davon gesetzt ist.
*/}}
{{- define "barynt.podCommon" -}}
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.priorityClassName }}
priorityClassName: {{ . | quote }}
{{- end }}
{{- end -}}

{{/* Das App-Image: ein Digest pinnt unveränderlich und hat Vorrang vor dem Tag. */}}
{{- define "barynt.appImage" -}}
{{- if .Values.image.app.digest -}}
{{- printf "%s@%s" .Values.image.app.repository .Values.image.app.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.app.repository (.Values.image.app.tag | default .Chart.AppVersion) -}}
{{- end -}}
{{- end -}}

{{/* Mehr als eine App-Replica (fest oder per HPA) — für PDB und Topology-Spread. */}}
{{- define "barynt.multiReplica" -}}
{{- if or .Values.autoscaling.enabled (gt (int .Values.replicaCount) 1) -}}true{{- end -}}
{{- end -}}

{{/* RustFS bekommt einen eigenen Ingress (ingress.filesHost). */}}
{{- define "barynt.filesIngress" -}}
{{- if and .Values.ingress.enabled .Values.ingress.filesHost .Values.rustfs.enabled -}}true{{- end -}}
{{- end -}}

{{/*
S3_PUBLIC_ENDPOINT: wohin der Browser für vorsignierte Uploads/Downloads
geht. Explizit gesetzt gewinnt; sonst der Files-Ingress, wenn es ihn gibt;
sonst die interne Adresse (nur für den Server-Zugriff brauchbar).
*/}}
{{- define "barynt.s3PublicEndpoint" -}}
{{- if .Values.s3.publicEndpoint -}}
{{- .Values.s3.publicEndpoint -}}
{{- else if include "barynt.filesIngress" . -}}
{{- printf "%s://%s" (ternary "https" "http" .Values.ingress.tls.enabled) .Values.ingress.filesHost -}}
{{- else -}}
{{- include "barynt.s3Endpoint" . -}}
{{- end -}}
{{- end -}}
