#!/bin/sh
set -eu

S3_ENDPOINT="${S3_ENDPOINT:-http://seaweedfs:8333}"
S3_BUCKET="${S3_BUCKET:-investwatch}"
S3_REGION="${S3_REGION:-eu-central-1}"
: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"

# SeaweedFS runs with -s3.config, so every bucket call must be SigV4-signed.
s3_curl() {
  curl --aws-sigv4 "aws:amz:${S3_REGION}:s3" --user "${S3_ACCESS_KEY}:${S3_SECRET_KEY}" "$@"
}

echo "Waiting for SeaweedFS S3 at ${S3_ENDPOINT}..."
i=0
until curl -s -o /dev/null "${S3_ENDPOINT}/healthz"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Timed out waiting for SeaweedFS S3." >&2
    exit 1
  fi
  sleep 2
done

status=$(s3_curl -s -o /dev/null -w "%{http_code}" -I "${S3_ENDPOINT}/${S3_BUCKET}")
if [ "$status" = "200" ]; then
  echo "Bucket '${S3_BUCKET}' already exists."
  exit 0
fi

echo "Creating S3 bucket '${S3_BUCKET}'..."
s3_curl -sf -X PUT "${S3_ENDPOINT}/${S3_BUCKET}" >/dev/null
echo "Bucket '${S3_BUCKET}' is ready."
