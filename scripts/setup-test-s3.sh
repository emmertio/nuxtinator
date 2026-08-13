#!/usr/bin/env bash
set -euo pipefail

# Idempotent object-storage bootstrap for the test suite, mirroring
# setup-test-db.sh. Starts a MinIO container and creates the bucket the
# files/videos/inbox-attachment tests upload to. Safe to re-run.
#
# MinIO can't be a GitHub Actions `services:` entry — services can't override a
# container's command, and the MinIO image needs `server /data` to do anything.
# So CI calls this script as a step and it doubles as the local recipe.
#
# Override via env vars to give a worktree its own port and bucket:
#   TEST_S3_PORT=9600 TEST_S3_BUCKET=nuxtinator-test-6 ./scripts/setup-test-s3.sh

S3_PORT="${TEST_S3_PORT:-9000}"
S3_BUCKET="${TEST_S3_BUCKET:-nuxtinator-test}"
S3_USER="${TEST_S3_ACCESS_KEY:-minioadmin}"
S3_PASSWORD="${TEST_S3_SECRET_KEY:-minioadmin}"
CONTAINER="${TEST_S3_CONTAINER:-nuxtinator-test-minio}"

echo "==> Starting MinIO as ${CONTAINER} on :${S3_PORT}"

if [ -n "$(docker ps -q --filter "name=^${CONTAINER}$")" ]; then
  echo "    already running"
else
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  docker run -d --name "${CONTAINER}" \
    -p "${S3_PORT}:9000" \
    -e "MINIO_ROOT_USER=${S3_USER}" \
    -e "MINIO_ROOT_PASSWORD=${S3_PASSWORD}" \
    minio/minio:latest server /data >/dev/null
fi

echo "==> Waiting for MinIO to accept requests"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${S3_PORT}/minio/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:${S3_PORT}/minio/health/live" >/dev/null 2>&1; then
  echo "MinIO did not become healthy on :${S3_PORT}" >&2
  docker logs "${CONTAINER}" >&2 || true
  exit 1
fi

# Public reads on the bucket: the files layer serves shared objects straight
# from S3_PUBLIC_BASE_URL, so the tests that follow a public link need them
# fetchable without a signature.
echo "==> Creating bucket ${S3_BUCKET}"
docker run --rm --network host --entrypoint sh minio/mc:latest -c "
  mc alias set test 'http://127.0.0.1:${S3_PORT}' '${S3_USER}' '${S3_PASSWORD}' >/dev/null &&
  mc mb --ignore-existing 'test/${S3_BUCKET}' &&
  mc anonymous set download 'test/${S3_BUCKET}'
"

echo
echo "==> Done. Add these to dev/.env:"
echo
echo "S3_ENDPOINT=http://127.0.0.1:${S3_PORT}"
echo "S3_REGION=us-east-1"
echo "S3_ACCESS_KEY_ID=${S3_USER}"
echo "S3_SECRET_ACCESS_KEY=${S3_PASSWORD}"
echo "S3_BUCKET_NAME=${S3_BUCKET}"
echo "S3_PUBLIC_BUCKET_NAME=${S3_BUCKET}"
echo "S3_PUBLIC_BASE_URL=http://127.0.0.1:${S3_PORT}/${S3_BUCKET}"
