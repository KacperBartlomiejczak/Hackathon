#!/bin/sh
set -eu

S3_ENDPOINT="${S3_ENDPOINT:-http://seaweedfs:8333}"
S3_BUCKET="${S3_BUCKET:-investwatch}"

echo "Waiting for SeaweedFS S3 at ${S3_ENDPOINT}..."
i=0
until curl -s -o /dev/null "${S3_ENDPOINT}/"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Timed out waiting for SeaweedFS S3." >&2
    exit 1
  fi
  sleep 2
done

status=$(curl -s -o /dev/null -w "%{http_code}" "${S3_ENDPOINT}/${S3_BUCKET}")
if [ "$status" = "200" ]; then
  echo "Bucket '${S3_BUCKET}' already exists."
  exit 0
fi

echo "Creating S3 bucket '${S3_BUCKET}'..."
curl -sf -X PUT "${S3_ENDPOINT}/${S3_BUCKET}" >/dev/null
echo "Bucket '${S3_BUCKET}' is ready."
