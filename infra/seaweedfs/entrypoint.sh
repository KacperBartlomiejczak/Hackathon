#!/bin/sh
# Generates the S3 identity file from S3_ACCESS_KEY / S3_SECRET_KEY and starts SeaweedFS
# with signed-request authentication enabled (-s3.config), instead of anonymous S3.
set -eu

: "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
: "${S3_SECRET_KEY:?S3_SECRET_KEY is required}"

cat > /tmp/s3.json <<JSON
{"identities":[{"name":"investwatch","credentials":[{"accessKey":"${S3_ACCESS_KEY}","secretKey":"${S3_SECRET_KEY}"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON

exec /entrypoint.sh server -s3 -s3.port=8333 -s3.config=/tmp/s3.json -ip.bind=0.0.0.0
