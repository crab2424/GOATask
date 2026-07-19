#!/usr/bin/env bash
# goatask権限で実行するビルド専用スクリプト。goataskはsudo権限を持たないため、
# サービス再起動は呼び出し側(deploy/ci_deploy.shなど、sudo権限を持つユーザー)が別途行う。
set -euo pipefail

cd "$(dirname "$0")/.."

git pull

cd frontend
npm install
VITE_API_BASE= npm run build
cd ..

cd backend
go build -o server ./cmd/server
cd ..
