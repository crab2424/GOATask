#!/usr/bin/env bash
# Ampere A1 (Always Free) の空き容量が出るまでインスタンス作成をリトライするスクリプト。
# 「Out of host capacity」系のエラーの間はリトライを続け、それ以外のエラーは即停止する。
set -uo pipefail

COMPARTMENT_ID="ocid1.tenancy.oc1..aaaaaaaacl6atrd23i4cu7a5746v2x35fgr6abilauenjpe5apaelr6nod4a"
AVAILABILITY_DOMAIN="Jtan:AP-TOKYO-1-AD-1"
SUBNET_ID="ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaaxvnrecl6mf2curw7fsynwfuqntuidhziibdkfuvb46nex4nb5goa"
IMAGE_ID="ocid1.image.oc1.ap-tokyo-1.aaaaaaaac6xgrmnpr676gm356kgsf2lr23e2e5ik6oigfuno3ybz3nul5riq"
DISPLAY_NAME="goatask-vm"
OCPUS=1
MEMORY_GB=6
SSH_PUBLIC_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
RETRY_INTERVAL_SECONDS=60

SSH_KEY_CONTENT="$(cat "$SSH_PUBLIC_KEY_PATH")"
ATTEMPT=0

notify_success() {
	osascript -e 'display notification "OracleのVM作成に成功しました" with title "GOATask" sound name "Glass"' 2>/dev/null
	afplay /System/Library/Sounds/Glass.aiff 2>/dev/null
}

while true; do
	ATTEMPT=$((ATTEMPT + 1))
	TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
	echo "[$TIMESTAMP] attempt #$ATTEMPT: launching instance..."

	OUTPUT="$(oci compute instance launch \
		--compartment-id "$COMPARTMENT_ID" \
		--availability-domain "$AVAILABILITY_DOMAIN" \
		--shape "VM.Standard.A1.Flex" \
		--shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEMORY_GB}" \
		--subnet-id "$SUBNET_ID" \
		--image-id "$IMAGE_ID" \
		--display-name "$DISPLAY_NAME" \
		--assign-public-ip true \
		--metadata "{\"ssh_authorized_keys\":\"$SSH_KEY_CONTENT\"}" 2>&1)"
	STATUS=$?

	if [ $STATUS -eq 0 ]; then
		echo "$OUTPUT"
		echo "起動に成功しました。数分後に以下でPublic IPを確認してください:"
		echo "  oci compute instance list-vnics --instance-id <instance-id から取得したid>"
		notify_success
		exit 0
	fi

	if echo "$OUTPUT" | grep -Eqi "capacity|timed out|timeout|ServiceUnavailable|TooManyRequests|connection (aborted|reset)|Gateway Time-out"; then
		echo "空き容量なし、または一時的なネットワークエラー。${RETRY_INTERVAL_SECONDS}秒待って再試行します。"
		sleep "$RETRY_INTERVAL_SECONDS"
		continue
	fi

	echo "想定外のエラーです（認証/設定ミスの可能性）。スクリプトを停止します:"
	echo "$OUTPUT"
	exit 1
done
