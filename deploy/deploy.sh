#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git pull

cd frontend
npm install
npm run build
cd ..

cd backend
go build -o server ./cmd/server
cd ..

sudo systemctl restart goatask
sudo systemctl status goatask --no-pager
