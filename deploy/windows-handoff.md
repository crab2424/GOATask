# Oracle VM作成リトライをWindows(WSL2)へ引き継ぐ手順

Macの`deploy/provision_vm.sh`と同じことをWindows常駐機で行うための手順。

## 0. 前提

- Macとwindows機を同時にリトライさせると、空き容量が出たタイミングで**両方成功して2台VMができる**リスクがある。引き継ぐ場合はMac側を止めてからWindows側を起動すること（両方同時に走らせたい場合は、成功後に片方のインスタンスを手動terminateする前提で運用する）。
- Mac側の停止: `ps aux | grep provision_vm.sh` でPIDを確認し `kill <PID>`。

## 1. WSL2を入れる

Windows PowerShell（管理者）で:

```powershell
wsl --install -d Ubuntu
```

再起動後、Ubuntuの初回セットアップ（ユーザー名/パスワード作成）を済ませる。

## 2. WSL(Ubuntu)内でOCI CLIを導入

```bash
sudo apt update && sudo apt install -y python3 python3-pip curl
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
exec -l $SHELL
oci --version
```

## 3. Oracle側にWindows用のAPIキーを追加（Macの秘密鍵はコピーしない）

Macの秘密鍵をそのまま持ってくるのではなく、Windows専用のキーペアを新規発行してOracleの同一ユーザーに追加登録する。

```bash
mkdir -p ~/.oci
openssl genrsa -out ~/.oci/oci_api_key.pem 2048
chmod 600 ~/.oci/oci_api_key.pem
openssl rsa -pubout -in ~/.oci/oci_api_key.pem -out ~/.oci/oci_api_key_public.pem
cat ~/.oci/oci_api_key_public.pem
```

表示された公開鍵をOracle Console → 右上プロフィール → **My profile** → **API keys** → **Add API Key** → 「Paste Public Key」で貼り付けて追加。追加後に表示される「Configuration file preview」の内容を `~/.oci/config` に保存する（`user`, `fingerprint`, `tenancy`, `region=ap-tokyo-1`, `key_file=~/.oci/oci_api_key.pem`）。

動作確認:

```bash
oci iam region list
```

## 4. SSH公開鍵をMacから持ってくる（公開鍵のみでOK、秘密鍵は不要）

VM作成後にMacからSSHでログインする運用を維持するなら、**公開鍵だけ**をWindows側に置けば十分（秘密鍵はMacに残したまま）。

Macで:

```bash
cat ~/.ssh/id_ed25519.pub
```

出力をコピーし、WSL側で同じ内容を保存:

```bash
mkdir -p ~/.ssh
echo "<コピーした公開鍵の内容>" > ~/.ssh/id_ed25519.pub
```

## 5. リポジトリを取得してスクリプトを実行

```bash
git clone https://github.com/crab2424/GOATask.git
cd GOATask
chmod +x deploy/provision_vm.sh
nohup ./deploy/provision_vm.sh > provision_vm.log 2>&1 &
tail -f provision_vm.log
```

- `nohup ... &` にしておけばターミナルを閉じても動き続ける（WSL自体は起動しっぱなしにしておく必要がある。Windows機がスリープ/シャットダウンすると停止する点はMacと同じ）。
- 成功時はWindows側で`powershell.exe`経由のメッセージボックス通知が出るよう`provision_vm.sh`を対応済み（Mac用の`osascript`通知と自動判別）。

## 6. 成功後

Ingress開放→VM側ufw→DuckDNS切り替え→`deploy/`配下の設定配置→Renderからのデータ移行、の順に進む（詳細はClaudeの記憶メモ`oracle_migration_progress`を参照）。
