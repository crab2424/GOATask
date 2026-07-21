# GOATask

個人用タスク管理アプリ（カレンダー / タスク / メモ / 単語帳 / ファイル共有）。

## 技術スタック

- **バックエンド**: Go 1.22+ / Echo / GORM
- **DB**: PostgreSQL 16 (Docker)
- **フロントエンド**: Vite + React + TypeScript + Tailwind CSS

## ディレクトリ構成

```
GOATask/
├── backend/              # Go (Echo + GORM)
│   ├── cmd/server/       # エントリポイント
│   └── internal/
│       ├── config/       # 環境変数
│       ├── db/           # GORM 接続・マイグレーション
│       ├── handler/      # HTTP ハンドラ
│       └── model/        # ドメインモデル
├── frontend/             # Vite + React + TS
│   └── src/
│       ├── app/          # アプリ外枠・モードナビゲーション
│       ├── api/          # バックエンド API クライアント
│       ├── features/     # tasks / memos などモード別の実装
│       ├── shared/       # モード間で共有するUI・フック・処理
│       └── App.tsx       # 認証と現在モードの制御
└── docker-compose.yml    # PostgreSQL
```

## ローカル起動手順

### 1. PostgreSQL を起動

```bash
docker compose up -d
```

### 2. バックエンドを起動

```bash
cd backend
go run ./cmd/server
```

- ポート: `8080`
- ヘルスチェック: <http://localhost:8080/health>

#### ファイル共有を有効にする場合

OCI CLIの設定（`~/.oci/config`）を実行ユーザーから読み取れる状態にしたうえで、次の環境変数を設定します。バケット名とnamespaceは今回作成したバケットの値が既定値です。

```bash
export OCI_REGION=ap-tokyo-1
export OCI_OBJECT_STORAGE_NAMESPACE=nrskptzjyhtw
export OCI_BUCKET_NAME=goatask-files
export FILE_MAX_BYTES=52428800
export FILE_MAX_USER_BYTES=524288000
```

バケットは非公開のまま使用し、共有時に7日間有効なObject StorageのPre-Authenticated Request（読み取り専用URL）を発行します。

本番（OCI Compute上）では`OCI_AUTH_METHOD=instance_principal`を設定し、Dynamic Group + IAMポリシーでインスタンス自体に権限を付与する方式を使うため、サーバーに`~/.oci/config`や秘密鍵を配置する必要はありません。

### 3. フロントエンドを起動

```bash
cd frontend
npm install   # 初回のみ
npm run dev
```

- ポート: `5173`
- アクセス: <http://localhost:5173>

## API（現在実装済み）

| Method | Path             | 説明           |
| ------ | ---------------- | -------------- |
| GET    | `/health`        | ヘルスチェック |
| GET    | `/api/tasks`     | タスク一覧     |
| POST   | `/api/tasks`     | タスク作成     |
| GET    | `/api/tasks/:id` | タスク取得     |
| PUT    | `/api/tasks/:id` | タスク更新     |
| DELETE | `/api/tasks/:id` | タスク削除     |

ファイル共有API（認証必須）：

| Method | Path | 説明 |
| ------ | ---- | ---- |
| GET | `/api/files` | 自分のファイル一覧・使用量・残容量 |
| POST | `/api/files` | multipartの`file`フィールドでアップロード |
| POST | `/api/files/:id/shares` | 7日間有効な読み取りURLを発行 |
| DELETE | `/api/files/:id` | Object Storageとメタデータを即時削除 |

画面の「ファイル」モードから、一覧・アップロード・共有リンクのコピー／表示・削除を操作できます。1ファイル上限とユーザー総容量上限を超えるアップロードは拒否されます。

## 今後の実装予定

- [ ] カレンダー（FullCalendar）
- [ ] メモ（Markdown）
- [ ] 単語帳（暗記カード）
- [ ] ファイル共有（自分のデバイス間）
- [ ] 認証
- [ ] PWA 化
- [ ] クラウドデプロイ
