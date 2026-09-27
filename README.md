# Task Tool

NPO業務向けのタスク管理ツールです。
ログイン、所属・権限管理、タスク作成、担当者設定、期限通知、LINE通知などを提供します。

## 1. 最初に確認すること

久しぶりに改修する場合は、以下の順で確認してください。

1. このREADMEの「環境構成」を確認
2. `main`を最新化
3. `.env.local`が開発Supabaseを向いていることを確認
4. `npm run dev`でローカル動作確認
5. 作業ブランチを作成
6. push後、Vercel Previewで確認
7. Pull Request経由で`main`へマージ
8. Production Deploymentを確認

```bash
git switch main
git pull --ff-only origin main
git status --short
npm install
npm run dev
```

本番へ直接変更を加えないでください。

---

## 2. システム概要

### 主な機能

- ユーザー登録・ログイン
- パスワード再設定
- 支部・部署・メンバー管理
- ロールによる権限制御
- タスク作成・更新・担当者設定
- タスクのカレンダー表示
- 期限・予定時刻による通知ジョブ作成
- LINEアカウント連携
- LINE通知送信

### 技術構成

| 項目 | 技術 |
|---|---|
| フロントエンド | Next.js `<version>` |
| 言語 | TypeScript |
| ホスティング | Vercel |
| DB・認証 | Supabase |
| Edge Functions | Supabase Edge Functions |
| Bot対策 | Cloudflare Turnstile |
| 外部通知 | LINE Messaging API |
| リポジトリ | GitHub |

---

## 3. 環境構成

```mermaid
flowchart TD
    Local["Local<br>npm run dev"] --> DevDB["開発Supabase"]
    Preview["Vercel Preview<br>main以外"] --> DevDB
    Production["Vercel Production<br>main"] --> ProdDB["本番Supabase"]
```

| 環境 | 起動・デプロイ元 | Supabase | 用途 |
|---|---|---|---|
| Local | `.env.local`＋`npm run dev` | 開発 | 日常開発 |
| Preview | Vercelの非`main`ブランチ | 開発 | PR前検証 |
| Production | Vercelの`main`ブランチ | 本番 | 利用者向け本番 |

### 重要な原則

- LocalとPreviewは開発Supabaseを使用する
- Productionだけが本番Supabaseを使用する
- Previewから本番データへ接続しない
- 開発Cronは通常停止する
- 本番変更はPull Request経由で行う
- Secret値をREADME、ソースコード、Git履歴へ入れない

---

## 4. リソース一覧

### GitHub

| 項目 | 値 |
|---|---|
| Repository | `matsumoto14133/task-tool` |
| Production Branch | `main` |

### Vercel

| 項目 | 値 |
|---|---|
| 使用Project | `task-tool-prod` |
| Production Domain | `https://www.tasktool-dot-jp-hiroshima.jp` |
| Vercel Domain | `task-tool-prod.vercel.app` |
| Preview | 非`main`ブランチから自動作成 |

### Supabase

| 環境 | Project名 | Project Ref | 用途 |
|---|---|---|---|
| 開発 | `TaskTool` | `astzazujnpmdnzpbimcb` | Local・Preview |
| 本番 | `TaskTool-prod` | `dgnecjszhaiuqhvvblsq` | Production |

---

## 5. 主要ディレクトリ

```text
.
├── app/
│   ├── admin/                       # メンバー管理、部署管理、名前変更
│   ├── auth/                        # メール系？
│   ├── calendar/                    # カレンダー
│   ├── dashboard/                   # ダッシュボード
│   ├── forgot-password/             # 再設定メール送信
│   ├── login/                       # ログイン
│   ├── projects/                    # プロジェクト一覧
│   ├── reset-password/              # パスワード再設定
│   ├── settings/                    # 通知設定
│   ├── signup/                      # ユーザー登録
│   └── tasks/                       # 支部のタスク一覧
├── src/
│   ├── components/                  # コンポーネント
│   ├── hooks/                       # スマホ対応
│   └── lib/
│       ├── admin/                   # 管理権限・型定義
│       ├── env/                     # URLなどの環境判定
│       └── supabase/                # Browser・Server・Admin Client
├── supabase/
│   ├── config.toml                  # Edge Functionごとの設定
│   ├── migrations/                  # DB Migration
│   └── functions/
│       ├── _shared/                 # Edge Functions共通処理
│       ├── line-webhook/
│       ├── run-notifications/
│       ├── create-notification-jobs/
│       ├── create-daily-summary-jobs/
│       ├── create-timed-notification-jobs/
│       └── send-notifications/
├── public/                           # 静的ファイル
├── proxy.ts                          # 認証・ルーティング制御
├── .env.local                        # ローカル環境変数・Git管理外
└── README.md
```

現在の構成を確認する場合：

```bash
find app src supabase \
  -maxdepth 3 \
  -type f \
  | sort
```

---

## 6. ローカル開発

### 必要なもの

- Node.js `<version>`
- npm `<version>`
- Docker Desktop
- Supabase CLI
- GitHubへのSSH接続
- 開発Supabaseへのアクセス権

バージョン確認：

```bash
node --version
npm --version
npx supabase --version
docker --version
```

### 初回セットアップ

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

プロジェクト直下に`.env.local`を作成します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<development-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<development-publishable-key>
SUPABASE_SECRET_KEY=<development-vercel-or-local-secret-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<turnstile-test-site-key>
```

> `NEXT_PUBLIC_SUPABASE_ANON_KEY`という変数名は互換性のため残していますが、値には新しい`sb_publishable_...`形式を使用します。

### 起動

```bash
npm run dev
```

アクセス先：

```text
http://localhost:3000
```

### ローカル確認項目

- 開発用アカウントでログインできる
- 開発データが表示される
- ログアウトできる
- パスワード再設定メールを送信できる
- 管理機能が開発Supabaseへ接続している
- 本番データが表示されていない

### ビルド確認

```bash
npm run build
git diff --check
git status --short
```

---

## 7. 環境変数

### 変数一覧

| 変数 | 公開可否 | Local | Preview | Production |
|---|---|---:|---:|---:|
| `NEXT_PUBLIC_SUPABASE_URL` | 公開設定 | 開発 | 開発 | 本番 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開設定 | 開発Publishable | 開発Publishable | 本番Publishable |
| `SUPABASE_SECRET_KEY` | Secret | 開発 | 開発 | 本番 |
| `NEXT_PUBLIC_SITE_URL` | 公開設定 | localhost | 未設定 | 本番URL |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | 公開設定 | テスト | テスト | 本番Widget |

### Vercelでの設定

Vercel Projectは`task-tool-prod`へ集約します。

#### Preview

- 開発Supabase URL
- 開発Publishable key
- 開発用Secret API key
- TurnstileテストSite key
- `NEXT_PUBLIC_SITE_URL`は登録しない
  - Vercelが提供する`NEXT_PUBLIC_VERCEL_URL`を使用する

#### Production

- 本番Supabase URL
- 本番Publishable key
- 本番用Secret API key
- 本番Turnstile Site key
- 正式な`NEXT_PUBLIC_SITE_URL`

### Secretの保存場所

| Secret | 保存場所 |
|---|---|
| Local用Supabase Secret | `.env.local` |
| Vercel用Supabase Secret | Vercel Environment Variables |
| Edge Functions用Secret | Supabase API Keys／Edge Function Secrets |
| Cron呼び出し用Secret | Supabase API Keys＋Vault |
| LINE Channel Secret | Supabase Edge Function Secrets |
| LINE Channel Access Token | Supabase Edge Function Secrets |
| Turnstile Secret | Supabase Auth Bot Protection |

以下へSecretの実値を記載しないでください。

- README
- ソースコード
- Migration
- GitHub Issue／Pull Request
- Build log
- スクリーンショット

---

## 8. URL・認証設定

### アプリURL生成

対象ファイル：

```text
src/lib/env/getBaseUrl.ts
```

優先順位：

1. `NEXT_PUBLIC_SITE_URL`
2. `NEXT_PUBLIC_VERCEL_URL`
3. `http://localhost:3000`

パスワード再設定では、以下のURLを生成します。

```text
<base-url>/reset-password
```

### 開発Supabase Auth

Site URL：

```text
http://localhost:3000
```

Additional Redirect URLs：

```text
http://localhost:3000/**
https://*-<vercel-team-or-account-slug>.vercel.app/**
```

### 本番Supabase Auth

Site URL：

```text
https://www.tasktool-dot-jp-hiroshima.jp/
```

Additional Redirect URLs：

```text
https://www.tasktool-dot-jp-hiroshima.jp//**
<production-vercel-domain>/**
```

---

## 9. Cloudflare Turnstile

### Local・Preview

Cloudflare公式テストSite keyを使用します。

Supabase開発環境のBot Protectionには、対応するテストSecretを設定します。

### Production

本番用Widgetに以下を登録します。

```text
tasktool-dot-jp-hiroshima.jp/
www.tasktool-dot-jp-hiroshima.jp/
task-tool-prod.vercel.app
```

### 確認項目

- ログイン
- サインアップ
- パスワード再設定メール送信
- Turnstile関連の403・401が発生していないこと

---

## 10. Supabase Edge Functions

### Function一覧

| Function | 役割 | 呼び出し元 |
|---|---|---|
| `line-webhook` | LINE Webhook受信・連携 | LINE Platform |
| `run-notifications` | 通知処理全体の定期実行 | Supabase Cron |
| `create-notification-jobs` | 期限通知ジョブ作成 | 内部処理 |
| `create-daily-summary-jobs` | 日次サマリー作成 | 内部処理 |
| `create-timed-notification-jobs` | 時刻指定通知作成 | 内部処理 |
| `send-notifications` | 通知送信 | 内部処理 |

### 認証設定

`supabase/config.toml`：

```toml
[functions.line-webhook]
verify_jwt = false

[functions.run-notifications]
verify_jwt = false
```

- `line-webhook`はLINE署名をコード内で検証する
- `run-notifications`は`apikey`ヘッダーをコード内で検証する
- Secret値をコードへ直接記載しない

### Secret API keyの命名規則

例：

```text
vercel_production_<YYYYMM>
vercel_preview_local_<YYYYMM>
edge_functions_runtime_<YYYYMM>
cron_run_notifications_<YYYYMM>
```

コードにはSecretの実値ではなく、キー名だけを記載します。

### デプロイ

開発：

```bash
npx supabase functions deploy \
  --project-ref astzazujnpmdnzpbimcb
```

本番：

```bash
npx supabase functions deploy \
  --project-ref dgnecjszhaiuqhvvblsq
```

個別デプロイ：

```bash
npx supabase functions deploy run-notifications \
  --project-ref <project-ref>
```

デプロイ後：

```bash
npx supabase functions list \
  --project-ref <project-ref>
```

### LINE Webhook疎通確認

GETでは、公開されたFunctionまで到達すると`405 Method Not Allowed`になります。

```bash
curl -i --max-time 10 \
  https://<project-ref>.supabase.co/functions/v1/line-webhook
```

署名付き空イベントPOSTでは`200 OK`を確認します。

```json
{"events":[]}
```

空イベントなのでLINE返信やDB更新は発生しません。

---

## 11. 通知Cron

### 本番

| 項目 | 設定 |
|---|---|
| Job名 | `run-notifications-every-1-min` |
| Schedule | `* * * * *` |
| Active | `true` |
| 呼び出し先 | 本番`run-notifications` |
| 認証 | Vault＋`apikey` |

### 開発

| 項目 | 設定 |
|---|---|
| Job名 | `run-notifications-every-1-min` |
| Schedule | `* * * * *` |
| Active | `false` |
| 呼び出し先 | 開発`run-notifications` |
| 認証 | Vault＋`apikey` |

開発Cronは通常停止します。通知テスト時のみ、送信対象を確認したうえで一時的に有効化してください。

### 状態確認

```sql
select
  jobid,
  jobname,
  schedule,
  active
from cron.job
order by jobid;
```

旧JWTが残っていないことの確認：

```sql
select
  jobid,
  jobname,
  command ~ 'eyJ[A-Za-z0-9_-]*\.' as contains_legacy_jwt,
  command ilike '%Authorization%' as contains_authorization,
  command ilike '%apikey%' as uses_apikey,
  command ilike '%vault.decrypted_secrets%' as uses_vault
from cron.job
order by jobid;
```

期待値：

- `contains_legacy_jwt = false`
- `contains_authorization = false`
- `uses_apikey = true`
- `uses_vault = true`

Secret値を取得するSQL結果を共有しないでください。

---

## 12. DB・Migration運用

### 原則

- スキーマ変更はMigrationとしてGit管理する
- 本番だけに手作業で変更を加えない
- 先に開発Supabaseで検証する
- Migration SQLをレビューしてから本番へ反映する
- VaultのSecret値はMigrationへ含めない

### Migration確認

```bash
npx supabase migration list
```

### 差分作成

```bash
npx supabase db diff \
  -f <migration-name>
```

生成されたSQLを確認します。

```bash
git diff -- supabase/migrations
```

### 本番反映前チェック

- 開発Supabaseで適用済み
- RLSへの影響を確認済み
- 既存データへの影響を確認済み
- バックアップ・復旧方法を確認済み
- Secret値を含んでいない

---

## 13. 通常の開発フロー

### 原則

* 本番ブランチ`main`へ直接コミットしない
* 1つの改修につき1つの作業ブランチを作成する
* マージ済みの作業ブランチを次の改修で再利用しない
* コードを変更する前に、現在のブランチを確認する
* ユーザーの未関連変更を同じcommitへ含めない
* Git履歴の書き換えやforce pushを行わない

Pull RequestをGitHub上でマージしても、ローカルのブランチは自動的に`main`へ切り替わりません。

次の作業を始める前に、必ず現在のブランチと作業ツリーを確認してください。

```bash
git branch --show-current
git status --short
```

---

### 1. 作業開始前の状態確認

```bash
git branch --show-current
git status --short
```

確認項目：

* 現在のブランチ
* commitしていない変更の有無
* 前回の作業ブランチに残っていないか
* 未追跡ファイルの有無

`git status --short`に変更が表示された場合は、すぐに`git switch`や`git pull`を実行せず、変更内容を確認します。

```bash
git diff
```

既存変更を勝手に削除、上書き、commitしないでください。

---

### 2. mainを最新化

作業ツリーが空であることを確認してから実行します。

```bash
git switch main
git pull --ff-only origin main
git status --short
```

確認項目：

* 現在のブランチが`main`
* `origin/main`の最新内容を取得済み
* `git status --short`に何も表示されない

---

### 3. 作業ブランチを作成

コードを変更する前に、改修内容に対応するブランチを作成します。

```bash
git switch -c <type>/<short-description>
```

命名例：

```text
fix/login-after-logout
perf/remove-dashboard-focus-reload
feat/add-task-filter
chore/update-dependencies
docs/update-operation-guide
```

ブランチ種別：

| 種別       | 用途       |
| -------- | -------- |
| `fix/`   | バグ修正     |
| `perf/`  | 性能改善     |
| `feat/`  | 機能追加     |
| `chore/` | 保守・設定変更  |
| `docs/`  | ドキュメント変更 |

作成後、必ず現在のブランチを確認します。

```bash
git branch --show-current
git status --short
```

期待する作業ブランチ名が表示されるまでは、ファイルを変更しないでください。

---

### 4. 改修前の整理

変更を始める前に、以下を整理します。

1. 現象または要求
2. 期待値
3. 再現条件
4. 影響範囲
5. 関連ファイル
6. DB・認証・権限への影響
7. Local／Preview／Productionへの影響
8. 最小の変更方針
9. 検証方法
10. ロールバック方法

不明なコードや設定は推測せず、検索やログ確認によって調査します。

---

### 5. ローカルで開発・確認

通常起動：

```bash
npm run dev
```

最低限、以下を確認します。

* 開発Supabaseへ接続している
* 本番Supabaseへ接続していない
* 開発用アカウントでログインできる
* 開発データが表示される
* 変更対象機能が期待どおり動作する
* 関連機能に回帰がない
* ブラウザConsoleに想定外のエラーがない
* ログアウトできる

変更後：

```bash
git diff --check
./node_modules/.bin/tsc --noEmit
npm run build
git status --short
git diff
```

ESLintが正常に動作する環境では、変更ファイルを指定して実行します。

```bash
npx eslint <changed-file>
```

ESLintが停止する場合は無理に継続せず、停止位置と実行環境を記録します。

---

### 6. commit前の確認

最初に、現在のブランチを再確認します。

```bash
git branch --show-current
git status --short
git diff --check
git diff
```

確認項目：

* `main`ではなく作業ブランチにいる
* ブランチ名が今回の改修内容と一致している
* 変更ファイルが想定範囲だけ
* 未関連変更が含まれていない
* `.env`やSecretが含まれていない
* デバッグ用コードや不要なログが残っていない

Secretを確認します。

```bash
git grep -nE \
  'SUPABASE_SERVICE_ROLE_KEY|sb_secret_|eyJ[A-Za-z0-9_-]*\.' \
  || true
```

実際のSecret値が表示された場合はcommitしないでください。

`.env.local`や`supabase/functions/.env`はGit管理しません。

---

### 7. 関係ファイルだけをadd

変更対象のファイルだけを指定します。

```bash
git add <files>
```

ステージされた差分を確認します。

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached
```

`git add .`は未関連変更を含める可能性があるため、原則として使用しません。

---

### 8. commit

```bash
git commit -m "<type>: <summary>"
```

例：

```text
fix: submit captcha token during login
perf: stop dashboard reload on window focus
docs: document development workflow and LINE notifications
```

commit後に確認します。

```bash
git status --short
git log -1 --oneline
```

確認項目：

* commitが期待する作業ブランチに作成されている
* 作業ツリーに未commitの変更が残っていない
* commitメッセージが変更内容を表している

---

### 9. mainとの差分確認

push前に、Pull Requestへ含まれるcommitとファイルを確認します。

```bash
git log --oneline main..HEAD
git diff --stat main...HEAD
git diff main...HEAD
```

確認項目：

* 今回の作業commitだけが表示される
* 変更ファイルが想定範囲だけ
* 過去の別作業のcommitが含まれていない
* Secretや`.env`が含まれていない

想定していないcommitやファイルが含まれている場合は、pushせず原因を確認します。

---

### 10. push

```bash
git push -u origin <branch-name>
```

push後：

```bash
git status --short
git branch -vv
```

確認項目：

* push先のブランチ名が正しい
* `main`へ直接pushしていない
* ローカルブランチが対応するリモートブランチを追跡している
* 作業ツリーが空

---

### 11. Vercel Previewで確認

push後、Vercel Project `task-tool-prod`にPreview Deploymentが作成されます。

最低限、以下を確認します。

* Preview Deploymentが`Ready`
* Branchが作業ブランチと一致
* Environmentが`Preview`
* 開発Supabaseへ接続している
* 開発データが表示される
* 本番データへ影響していない
* 変更対象機能が期待どおり動作する
* Vercel Runtime Logsに想定外のエラーがない
* 想定外の401・403・500がない

認証関連の変更では、Preview URLが開発SupabaseのRedirect URLsに許可されていることも確認します。

---

### 12. Pull Request

確認項目：

* base：`main`
* compare：作業ブランチ
* Files changedが想定範囲だけ
* `.env`やSecretが含まれていない
* Previewが`Ready`
* Local／Previewの検証結果が記載されている
* DB変更がある場合はMigrationが含まれている
* README更新の要否を確認済み

問題がなければ`main`へマージします。

---

### 13. Production確認

`main`へのマージ後、Vercel Production Deploymentが`Ready`になるまで待ちます。

最低限、以下を確認します。

* 正式ドメインへアクセスできる
* ログインできる
* 本番データのダッシュボードが表示される
* ログアウトできる
* 変更対象機能が期待どおり動作する
* Vercel Production Logsに想定外のエラーがない
* 必要に応じてSupabase Logsを確認する
* 想定外の401・403・500がない

---

### 14. 作業完了後

Pull Requestをマージしても、ローカルでは作業ブランチのままです。

次の改修を始める前に、必ず以下を実行します。

```bash
git switch main
git pull --ff-only origin main
git fetch --prune
git branch --show-current
git status --short
```

期待結果：

* 現在のブランチが`main`
* `main`が`origin/main`と同期している
* 作業ツリーが空

次の改修では、最新の`main`から新しい作業ブランチを作成します。

---

### 誤ったブランチで変更した場合

#### まだcommitしていない場合

変更を一時退避します。

```bash
git stash push -m "wip: <変更内容>" -- <files>
```

最新の`main`から正しいブランチを作成します。

```bash
git switch main
git pull --ff-only origin main
git status --short
git switch -c <correct-branch>
```

対象のstashを確認します。

```bash
git stash list
git stash show --stat <対象のstash>
```

正しいブランチへ変更を反映します。

```bash
git stash apply <対象のstash>
git status --short
git diff
```

変更内容を確認できるまでは、stashを削除しません。

---

#### すでにcommitしたが、まだpushしていない場合

誤ったcommitのハッシュを確認します。

```bash
git log -1 --oneline
```

未commitの別変更がある場合は、対象ファイルだけを一時退避します。

```bash
git stash push -m "wip: <変更内容>" -- <files>
git status --short
```

最新の`main`から正しいブランチを作成します。

```bash
git switch main
git pull --ff-only origin main
git status --short
git switch -c <correct-branch>
```

誤ったブランチに作成したcommitを、正しいブランチへコピーします。

```bash
git cherry-pick <commit-hash>
```

コピー後に確認します。

```bash
git status --short
git log --oneline -3
git diff --stat main...HEAD
git diff main...HEAD
```

元の誤ったブランチはpushしません。

`git reset --hard`、rebase、commitのamend、force pushなどによる履歴の書き換えは行いません。

---

#### 誤ったブランチをすでにpushした場合

以下の操作は行わないでください。

* 誤ったPull Requestをマージする
* force pushする
* 独断でリモートブランチを削除する
* Git履歴を書き換える

まず、以下を確認します。

```bash
git branch --show-current
git status --short
git log --oneline -5
git branch -vv
```

確認結果をもとに、正しいブランチの作成方法とリモートブランチの扱いを決定します。

---

## 14. デプロイとロールバック

### Vercel

`main`へのマージでProduction Deploymentが作成されます。

環境変数の変更は既存Deploymentへ反映されません。変更後は新しいDeploymentが必要です。

### ロールバック

Vercel：

1. 正常だった過去Deploymentを確認
2. Promote／Redeployを実行
3. 正式ドメインの割り当てを確認
4. Production Logsを確認

DB：

- 破壊的Migrationは事前に復旧SQLを準備する
- 本番データの手動削除は対象件数を確認してから行う
- 本番復旧時に開発DBを接続しない

Edge Functions：

```bash
git checkout <known-good-commit> -- supabase/functions/<function>
npx supabase functions deploy <function> \
  --project-ref <project-ref>
```

---

## 15. セキュリティ運用

### 現在のキー方式

- legacy `anon`／`service_role`は無効
- ブラウザはPublishable keyを使用
- サーバーはSecret API keyを使用
- Cron SecretはVaultに保存
- LINE SecretはEdge Function Secretsに保存

### Secretローテーション

1. 新しい用途別Secret API keyを作成
2. Vercel／Vault／Edge Functionsを更新
3. 新キーで疎通確認
4. 旧キーの利用箇所を検索
5. 旧キーを削除
6. 実施日と用途を記録

### 現行ファイルのSecret確認

```bash
git grep -nE \
  'SUPABASE_SERVICE_ROLE_KEY|sb_secret_|eyJ[A-Za-z0-9_-]*\.' \
  || true
```

期待結果は0件です。

追跡対象確認：

```bash
git ls-files \
  | grep -E '(^|/)\.env' \
  || true
```

`.env.local`や`supabase/functions/.env`をGit管理しないでください。

---

## 16. 運用確認

### Vercel

- 最新Production Deploymentが`Ready`
- Production Branchが`main`
- カスタムドメインが正しいProjectへ接続
- ProductionとPreviewの環境変数が分離されている
- 旧ProjectがGitHubから切断されている

### Supabase

- Database・Auth・Realtime・Edge FunctionsがHealthy
- Disk IO Budget
- CPU・Memory
- Edge Function 401／500
- Cron実行状況
- Migration履歴
- 開発Cronが意図せず有効になっていない

### Cloudflare

- 本番Widgetのhostname
- 旧Vercel hostnameが残っていない
- 本番SupabaseのTurnstile Secret
- 開発SupabaseはテストSecret

---

## 17. 障害時の確認順

### ログインできない

1. Vercel Deploymentが`Ready`か
2. Supabase Health
3. Auth Logs
4. Turnstile設定
5. `NEXT_PUBLIC_SUPABASE_URL`
6. Publishable keyの環境
7. Supabase Redirect URLs
8. ブラウザConsole／Network

### データが表示されない

1. Local／Preview／Productionのどの環境か確認
2. 接続中のSupabase Project Refを確認
3. RLS Policy
4. Membership・Profile
5. Vercel Runtime Logs
6. Supabase API Logs
7. DB負荷・Disk IO

### Edge Functionが401

1. `verify_jwt`設定
2. `apikey`／`Authorization`の使い分け
3. Secret API keyの名前
4. `SUPABASE_SECRET_KEYS`内のキー名
5. VaultのSecret名
6. 対象Projectが開発か本番か

### Cronが動かない

```sql
select
  jobid,
  jobname,
  schedule,
  active
from cron.job;
```

確認項目：

- `active`
- Function URL
- Vault Secret名
- `apikey`ヘッダー
- Edge Function Logs
- Cron実行履歴

---

## 18. 既知の課題・改善候補

- Dashboard操作時のUser重複取得
- Vercel Function Regionの見直し
- DB Index・Queryの最適化
- Disk IO監視
- Supabase定期アップデート
- Edge Functionsの依存関係をFunction単位へ移行
- TypeScript 6で非推奨になった`baseUrl`の移行
- Preview用Turnstile運用の改善
- Cron・Vault設定の再現手順整備
- Git履歴に残る無効化済み旧キーの扱い
- 旧Vercel Projectの削除

---

## 19. 変更時にREADMEも更新する項目

以下を変更した場合、このREADMEも同時に更新してください。

- Vercel Project・ドメイン
- Production Branch
- Supabase Project
- 環境変数名
- Secret API keyの用途名
- Edge Function
- Cron
- Auth Redirect URL
- Turnstile hostname
- ディレクトリ構成
- デプロイ手順
- 障害対応手順

---
## 20.本番ドメイン（旧READMEより）

### 正式URL

- 正式URL：`https://www.tasktool-dot-jp-hiroshima.jp`
- apex：`https://tasktool-dot-jp-hiroshima.jp`
- Vercel標準ドメイン：`https://task-tool-prod.vercel.app`

### 運用方針

- apexはwwwへリダイレクトする
- アプリ内・ドキュメント内の本番URLはwwwありで統一する
- 本番ドメインはVercel Project `task-tool-prod`へ接続する
- `task-tool-lbjv`は使用しない

---
## 21.Supabase Auth設定（旧READMEより）

### 開発Supabase

LocalとVercel Previewで使用します。

#### Site URL

- `http://localhost:3000`

#### Redirect URLs

- `http://localhost:3000/**`
- `https://*-matsumoto14133s-projects.vercel.app/**`

Preview URLはデプロイごとに変わるため、Vercelアカウントslugを含むワイルドカードを使用します。

### 本番Supabase

Vercel Productionでのみ使用します。

#### Site URL

- `https://www.tasktool-dot-jp-hiroshima.jp`

#### Redirect URLs

- `https://www.tasktool-dot-jp-hiroshima.jp/**`
- `https://tasktool-dot-jp-hiroshima.jp/**`
- `https://task-tool-prod.vercel.app/**`

### 認証メールとリダイレクト

#### signup確認メール

確認リンクは以下のRouteへ遷移します。

- `/auth/confirm?token_hash=...&type=email`

Supabaseのメールテンプレートを変更するときは、`token_hash`と`type`が失われないようにします。

#### パスワード再設定

- `resetPasswordForEmail()`の`redirectTo`は`/reset-password`
- パスワード再設定メールでは`{{ .ConfirmationURL }}`を使用
- `/auth/reset-password`は使用しない

---

## 22.Cloudflare Turnstile設定（旧READMEより）

### Local

- Cloudflare公式テストSite keyを使用
- Supabase開発環境には公式テストSecretを設定
- 本番Widgetへ`localhost`を登録する必要はない

### Preview

- Cloudflare公式テストSite keyを使用
- Preview URLを本番Widgetへ登録しない

### Production

使用Widget：`<本番Widget名>`

登録hostname：

- `www.tasktool-dot-jp-hiroshima.jp`
- `tasktool-dot-jp-hiroshima.jp`
- `task-tool-prod.vercel.app`

設定：

- Pre-clearance：OFF
- Supabase本番環境のBot Protectionに、本番WidgetのSecretを設定
- `task-tool-lbjv.vercel.app`は登録しない

### 動作確認

- signup
- login
- forgot-password
- 本番Supabase Auth Logs
- ブラウザNetwork上のTurnstileエラー

---

## 23.ドメイン・DNS設定（旧READMEより）

### 管理サービス

- ドメイン管理：お名前.com
- DNS管理：お名前.com

### ネームサーバー

- `01.dnsv.jp`
- `02.dnsv.jp`
- `03.dnsv.jp`
- `04.dnsv.jp`

### DNSレコード

| Name | Type | Value | 用途 |
|---|---|---|---|
| `@` | `A` | `216.198.79.1` | apexドメイン |
| `www` | `CNAME` | `3ae1a3f254b6b2d6.vercel-dns-017.com` | Vercel Production |

### Vercel Domain構成

- `tasktool-dot-jp-hiroshima.jp`
  - `www.tasktool-dot-jp-hiroshima.jp`へリダイレクト
- `www.tasktool-dot-jp-hiroshima.jp`
  - Vercel Project `task-tool-prod`のProductionへ接続
- `task-tool-prod.vercel.app`
  - Vercel Projectの標準Productionドメイン

### 変更時の注意

- DNS値を推測で変更しない
- VercelのDomains画面に表示される推奨値を正とする
- 変更前に現在のレコードを記録する
- 変更後はVercelの`Valid Configuration`とSSLを確認する

最終確認日：`<YYYY-MM-DD>`

---

## 24.認証関連のコード（旧READMEより）

### ベースURL生成

ファイル：

- `src/lib/env/getBaseUrl.ts`

用途：

- パスワード再設定の`redirectTo`生成
- Local・Preview・ProductionのURL切り替え

優先順位：

1. `NEXT_PUBLIC_SITE_URL`
2. `NEXT_PUBLIC_VERCEL_URL`
3. `http://localhost:3000`

### パスワード再設定メール

ファイル：

- `app/forgot-password/ForgotPasswordClient.tsx`

処理：

```ts
const redirectTo = `${getBaseUrl()}/reset-password`;
```

---

## 25.リリース後のスモークテスト（旧READMEより）

最終確認日：`<YYYY-MM-DD>`

### ドメイン・アクセス

- [ ] `https://www.tasktool-dot-jp-hiroshima.jp/`へアクセスできる
- [ ] `/`から`/login`へ遷移する
- [ ] apexからwwwへリダイレクトする
- [ ] SSLエラーがない
- [ ] Vercel Domainsが`Valid Configuration`

### 認証

- [ ] signup → confirm → login
- [ ] forgot-password → reset-password → login
- [ ] Turnstileが成功する
- [ ] 未ログインで`/dashboard` → `/login`
- [ ] ログイン済みで`/login` → `/dashboard`
- [ ] ログイン済みで`/signup` → `/dashboard`
- [ ] ログアウトできる

### データ・権限

- [ ] 本番データが表示される
- [ ] 開発データが混在していない
- [ ] 一般ユーザーの権限制御が有効
- [ ] 管理者機能が動作する
- [ ] Vercel Production Logsに想定外の500がない

### 通知

- [ ] 本番Cronが有効
- [ ] `run-notifications`がHTTP 200
- [ ] LINE Webhookの署名付き空イベントがHTTP 200
- [ ] 通知エラーが連続していない

---

## 通知について

### 通知仕様

通知はLINE連携済みユーザーに対して送信します。共通の対象条件は以下です。

* `line_accounts.is_active = true`
* 対象タスクの担当者である
* 担当者ステータスが`done`ではない

| 通知      | タイミング             |
| ------- | ----------------- |
| タスク一覧通知 | ユーザーが設定した時刻に1日1回  |
| 期限通知    | 期限1時間前、期限時刻       |
| 実施予定通知  | 実施予定時刻、または指定した分数前 |

タスク一覧通知には以下を含みます。

* 今日が期限のタスク
* 明日が期限のタスク
* 今日の実施予定
* 明日の実施予定

対象タスクが0件の場合、タスク一覧通知のジョブは作成せず、LINEも送信しません。

タスク一覧通知を有効にするには、通知設定画面で時刻を保存し、`user_notification_profiles`へ設定を登録する必要があります。初期表示は`09:00`ですが、未保存の場合は通知対象になりません。

実施予定通知の有効・無効と事前通知の分数は、各タスクの担当者単位で設定します。

### 通知ジョブ

通知は`notification_jobs`で管理します。

* `dedupe_key`の一意制約により重複作成を防止する
* タスク一覧通知のキーは`daily_summary:<user_id>:<JST日付>`
* 1回の実行で最大50件のLINE通知を処理する
* 送信成功時は`sent`
* 送信失敗時は再試行し、最大3回失敗すると`failed`
* 同じ日のタスク一覧通知がすでに存在する場合、設定時刻を変更しても再作成しない

### LINE連携

LINE連携コードは通知設定画面から発行します。

1. LINE公式アカウントを友だち追加
2. 通知設定画面で連携コードを発行
3. 10分以内に`LINK-XXXXXX`形式のコードをLINEへ送信
4. `line-webhook`がコードを検証し、LINEアカウントとユーザーを紐付ける

`line-webhook`は`verify_jwt = false`ですが、コード内でLINE署名を検証します。署名検証を削除しないでください。

本番LINE公式アカウントとの実運用・通知確認はProductionで行います。開発Cronは通常停止します。

### リッチメニュー

リッチメニューの「マニュアル」は、テキストメッセージを送信せず、URIアクションでマニュアルURLを直接開きます。

これにより、リッチメニュー操作では`line-webhook`を呼び出さず、連携コード確認メッセージとの二重応答を防止します。

現在の`line-webhook`は、`LINK-XXXXXX`形式ではないテキストを受信すると、連携コードを確認できない旨を返信します。ユーザーが「マニュアル」などの文字を手入力した場合はこの返信が発生します。必要になった場合は、`LINK-`で始まらないテキストを無視するよう改修します。

### 本番確認記録

2026年9月28日に以下を確認しました。

* Production Cronが毎分実行で有効
* 直近24時間のCron実行がすべて成功
* 通知ジョブが正常に`sent`へ更新される
* テストタスクの通知を本番LINEで受信
* タスク一覧通知の重複防止とタスク0件時の動作を確認
* リッチメニューの「マニュアル」をURIアクションへ変更

---

## 99. 更新情報

| 項目 | 内容 |
|---|---|
| 最終更新日 | `2026-09-27` |
| 更新者 | `松本` |
| 本番確認日 | `2026-09-27` |

### 主な変更履歴

| 日付 | 内容 |
|---|---|
| `2026-09-27` | Local／Preview／Productionを分離 |
| `2026-09-27` | Supabase legacy keysを無効化 |
| `2026-09-27` | CronをVault＋`apikey`方式へ移行 |
| `2026-09-27` | Vercel Projectを`task-tool-prod`へ統一 |