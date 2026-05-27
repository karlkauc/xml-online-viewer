# Deploying to Google Cloud Run (hardened, public)

This service is designed to run as a **public** (`--allow-unauthenticated`)
Cloud Run service. The app contains application-level hardening (XXE/SSRF/XML-
bomb protection, ZIP-bomb limits, node limits, security headers/HSTS, streamed
size caps); the items below are the platform-level controls to apply on top.

## 1. Build & deploy

```bash
PROJECT=your-project
REGION=europe-west1
IMAGE=$REGION-docker.pkg.dev/$PROJECT/apps/fundsxml-validator

gcloud builds submit --tag "$IMAGE"

gcloud run deploy fundsxml-validator \
  --image "$IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --ingress all \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 20 \
  --max-instances 5 \
  --timeout 120 \
  --set-env-vars LOG_LEVEL=INFO,MAX_UPLOAD_MB=50,MAX_ZIP_ENTRIES=2000,MAX_ZIP_UNCOMPRESSED_MB=200,MAX_XML_NODES=500000,CACHE_TTL_MIN=60,CACHE_MAX_ENTRIES=64,FETCH_MAX_RESPONSE_MB=10
```

- **Memory 1Gi:** lxml parsing + the in-memory tree model + Excel generation are
  memory-hungry; size against your largest expected documents. `MAX_XML_NODES`
  and `MAX_ZIP_UNCOMPRESSED_MB` bound worst-case memory per request.
- **Concurrency 20 / max-instances:** caps cost and parallel heavy parses. Tune
  with load tests. Lower concurrency = more isolation per request.
- **timeout 120:** large schema compiles can be slow; raise if needed.
- The container already runs as **non-root** (UID 1001) and the base images are
  **pinned by digest** — keep rebuilding to pick up libxml2/base patches.

## 2. Rate limiting & bot protection — use Cloud Armor

The in-app rate limiter (slowapi) is **in-memory and per-instance**, so it does
not enforce a global limit across autoscaled instances. Put real limits at the
edge with an external HTTPS Load Balancer + **Cloud Armor**:

```bash
gcloud compute security-policies create fxv-policy
gcloud compute security-policies rules create 1000 \
  --security-policy fxv-policy \
  --expression "true" \
  --action throttle \
  --rate-limit-threshold-count 120 \
  --rate-limit-threshold-interval-sec 60 \
  --conform-action allow --exceed-action deny-429 \
  --enforce-on-key IP
```

Attach the policy to the backend service fronting Cloud Run. Optionally add
reCAPTCHA Enterprise / bot rules.

## 3. Egress control — SSRF defense in depth

The URL loaders and the FundsXML-release feature **intentionally fetch
arbitrary user-supplied URLs**, so `ALLOWED_SCHEMA_HOSTS` is left empty by
default (setting it to a host-regex allowlist would disable that feature — do so
only if you want to lock fetching down to e.g. `^raw\.githubusercontent\.com$`).

In-app SSRF protection already blocks private/loopback/link-local IPs (incl. the
GCP metadata IP `169.254.169.254`) and pins each request to a pre-validated IP
(DNS-rebinding safe). Add a network-level backstop:

- Route egress through a **Serverless VPC Access connector** with
  `--vpc-egress all-traffic`, and use **Cloud NAT + firewall/Cloud NGFW** rules
  that deny RFC1918 and metadata ranges. This guarantees the container cannot
  reach internal resources even if app logic regresses.

## 4. Supply chain & images

- Push images to **Artifact Registry** and enable **vulnerability scanning**.
- Rebuild on a schedule so digest-pinned base images receive security patches;
  bump the `@sha256:` digests in `Dockerfile` when refreshing.
- `npm ci` and pinned Python deps give reproducible builds.

## 5. Secrets & logging

- No secrets are required. If any are added later, use **Secret Manager** mounted
  as env/files — never bake into the image or `--set-env-vars`.
- Logs are structured JSON on stdout with a `severity` field, so **Cloud Logging**
  classifies levels automatically. Keep `LOG_LEVEL=INFO` in production (DEBUG may
  log more detail).

## 6. Known multi-instance behavior (by design)

- The XML/XSD/validation **caches are in-memory and per-instance**. A document
  uploaded to one instance may not be found on another; clients should treat ids
  as short-lived. For cross-instance sharing, introduce a shared store (e.g.
  Memorystore/Redis) — not required for the current stateless UX.
- Caches are keyed by content hash with **no per-user isolation** (this is a
  public validation tool). Do not use it for confidential documents without
  adding authentication and per-user cache namespacing.
