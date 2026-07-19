#!/usr/bin/env bash
# GitHub Actions等、sudo権限を持つユーザー(ubuntu)から呼び出す想定のデプロイオーケストレーション。
# ビルドはgoatask権限で実行し、サービス再起動のみubuntu側のsudo権限で行う。
set -euo pipefail

sudo -u goatask -H /opt/goatask/deploy/deploy.sh

sudo systemctl restart goatask
sudo systemctl status goatask --no-pager
