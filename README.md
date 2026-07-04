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

## 今後の実装予定

- [ ] カレンダー（FullCalendar）
- [ ] メモ（Markdown）
- [ ] 単語帳（暗記カード）
- [ ] ファイル共有（自分のデバイス間）
- [ ] 認証
- [ ] PWA 化
- [ ] クラウドデプロイ
