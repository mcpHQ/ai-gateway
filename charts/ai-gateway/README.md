# AI Gateway

Helm chart for the Next.js AI Gateway and an optional Postgres database.

## Install

Merging to `main` publishes `ghcr.io/mcphq/ai-gateway:main`. Publishing a GitHub release, for example `v0.1.0`, also publishes `0.1.0`, `0.1`, `0`, and `latest`. `auth.url` must be the origin browsers use. The chart generates `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, and the Postgres password on the first install and keeps them on upgrade.

```bash
docker build -t ghcr.io/mcphq/ai-gateway:0.1.0 .
docker push ghcr.io/mcphq/ai-gateway:0.1.0

helm upgrade --install ai-gateway charts/ai-gateway \
  --set image.tag=0.1.0 \
  --set auth.url=http://localhost:3000
```

Port-forward when you are not using an ingress:

```bash
kubectl port-forward svc/ai-gateway 3000:80
```

## External database

```bash
helm upgrade --install ai-gateway charts/ai-gateway \
  --set postgres.enabled=false \
  --set database.url=postgres://user:pass@db.example:5432/aicost \
  --set auth.url=https://gateway.example.com \
  --set auth.secret="$(openssl rand -base64 32)" \
  --set encryptionKey="$(openssl rand -hex 32)"
```

`encryptionKey` is 64 hex characters. Changing it makes stored provider keys unreadable.

To keep the database URL out of Helm values, create a Secret and set `database.existingSecret`. To supply every variable yourself, set `existingSecret` to a Secret that contains `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `ENCRYPTION_KEY`.

## Ingress

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: gateway.example.com
      paths:
        - path: /
          pathType: Prefix
auth:
  url: https://gateway.example.com
  trustedOrigins: https://gateway.example.com
```
