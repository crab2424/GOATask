#!/usr/bin/env bash
# Always Free x86 Micro (VM.Standard.E2.1.Micro) の空き容量が出るまでインスタンス作成をリトライするスクリプト。
# Ampere A1 (ARM) は東京リージョンで空きが出なかったため、確実性優先でx86 Microへ変更(2026-07-17)。
# 「Out of host capacity」系のエラーの間はリトライを続け、それ以外のエラーは即停止する。
set -uo pipefail

COMPARTMENT_ID="ocid1.tenancy.oc1..aaaaaaaacl6atrd23i4cu7a5746v2x35fgr6abilauenjpe5apaelr6nod4a"
AVAILABILITY_DOMAIN="Jtan:AP-TOKYO-1-AD-1"
SUBNET_ID="ocid1.subnet.oc1.ap-tokyo-1.aaaaaaaaxvnrecl6mf2curw7fsynwfuqntuidhziibdkfuvb46nex4nb5goa"
IMAGE_ID="ocid1.image.oc1.ap-tokyo-1.aaaaaaaaoscw5alszu4h62xmlf2d3vusfpyyfxpooqxouff5wyc4w5g7e5bq"
DISPLAY_NAME="goatask-vm"
SSH_PUBLIC_KEY_PATH="$HOME/.ssh/id_ed25519.pub"
RETRY_INTERVAL_SECONDS=60

SSH_KEY_CONTENT="$(cat "$SSH_PUBLIC_KEY_PATH")"
ATTEMPT=0

notify_success() {
	if command -v osascript >/dev/null 2>&1; then
		osascript -e 'display notification "OracleのVM作成に成功しました" with title "GOATask" sound name "Glass"' 2>/dev/null
		afplay /System/Library/Sounds/Glass.aiff 2>/dev/null
	elif command -v powershell.exe >/dev/null 2>&1; then
		# WSL上ではWindows側のpowershell.exeを呼び出してメッセージボックスを表示する
		powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('OracleのVM作成に成功しました','GOATask')" >/dev/null 2>&1 &
	elif command -v notify-send >/dev/null 2>&1; then
		notify-send "GOATask" "OracleのVM作成に成功しました" 2>/dev/null
	fi
}

while true; do
	ATTEMPT=$((ATTEMPT + 1))
	TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
	echo "[$TIMESTAMP] attempt #$ATTEMPT: launching instance..."

	OUTPUT="$(oci compute instance launch \
		--compartment-id "$COMPARTMENT_ID" \
		--availability-domain "$AVAILABILITY_DOMAIN" \
		--shape "VM.Standard.E2.1.Micro" \
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
