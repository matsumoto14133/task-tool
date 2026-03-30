# タスク管理ツール 本番環境設定メモ

最終更新日: 2026-03-30 
管理者: 松本晃平

---

## 0. 本番で採用する構成（新project）

### Vercel
- 本番用 Project 名:task-tool-prod
- 本番用 Project URL:https://www.tasktool-dot-jp-hiroshima.jp
- GitHub Repository:task-tool
- Production Branch:`main`
- 備考:
  - 旧 Vercel Project は使わない
  - 今後の本番反映はこの Project に対して行う

### GitHub
- Repository 名:task-tool
- main branch:`main`
- 自動デプロイ:
  - [x] 有効
  - 備考:main への push で Vercel の本番プロジェクトに自動デプロイされる

### 本番ドメイン
- 正式URL:
  - `https://www.tasktool-dot-jp-hiroshima.jp`
- apex:
  - `https://tasktool-dot-jp-hiroshima.jp`
- 方針:
  - apex は www にリダイレクト
  - 本番URL表記は www ありで統一

---

## 1. テスト環境で採用する構成

### Vercel
- テスト用 Project 名:task-tool-lbjv
- テスト用 Project URL:
- GitHub Repository:task-tool
- Production Branch:`main`
- 備考:
  - 旧 Vercel Project は使わない
  - 今後の本番反映はこの Project に対して行う

### GitHub
- Repository 名:task-tool
- main branch:`main`
- 自動デプロイ:
  - [x] 有効
  - 備考:main への push で Vercel のテストプロジェクトに自動デプロイされる

### テストドメイン
- 正式URL:
  - ``
- apex:
  - ``
- 方針:
  - apex は www にリダイレクト
  - 本番URL表記は www ありで統一

---

## 2. Vercel 環境変数

### Production
- `NEXT_PUBLIC_SUPABASE_URL`
  - `https://dgnecjszhaiuqhvvblsq.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `sb_publishable_tBAgsaLc7EiNAcBXCXaaZQ_zcf7DLXc`
- `SUPABASE_SERVICE_ROLE_KEY`
  - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnbmVjanN6aGFpdXFodnZibHNxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg1ODY4NywiZXhwIjoyMDkwNDM0Njg3fQ.7ucOicICsgc1n7nes8DkxBOAtLchXsp9kBRb953mTRg`
- `NEXT_PUBLIC_SITE_URL`
  - `https://www.tasktool-dot-jp-hiroshima.jp`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `0x4AAAAAACx8XDZDC_K1e_oh`

### Preview
- `NEXT_PUBLIC_SUPABASE_URL`
  - `https://astzazujnpmdnzpbimcb.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `sb_publishable_aUOJDkOtLYxV8SS8Gxdusw_irAJccW5`
- `SUPABASE_SERVICE_ROLE_KEY`
  - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.  eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdHphenVqbnBtZG56cGJpbWNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkzMzk2OCwiZXhwIjoyMDg3NTA5OTY4fQ.lgcR0BytexvYzEWhmnrsFp0eMUf1iwYARxdPt0e4edk`
- `NEXT_PUBLIC_SITE_URL`
  - `https://www.tasktool-dot-jp-hiroshima.jp`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `0x4AAAAAACwZ3uXIKVJyZvoe`

### Development（.env.local）
- `NEXT_PUBLIC_SUPABASE_URL`
  - `https://astzazujnpmdnzpbimcb.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `sb_publishable_aUOJDkOtLYxV8SS8Gxdusw_irAJccW5`
- `SUPABASE_SERVICE_ROLE_KEY`
  - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.  eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzdHphenVqbnBtZG56cGJpbWNiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkzMzk2OCwiZXhwIjoyMDg3NTA5OTY4fQ.lgcR0BytexvYzEWhmnrsFp0eMUf1iwYARxdPt0e4edk`
- `NEXT_PUBLIC_SITE_URL`
  - `http://localhost:3000`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `1x00000000000000000000AA`

---

## 3. Supabase Auth 設定

### URL Configuration

#### Site URL
- `https://www.tasktool-dot-jp-hiroshima.jp`

#### Redirect URLs
- `http://localhost:3000/auth/reset-password`
- `http://localhost:3000/auth/confirm`
- `http://localhost:3000/**`
- `https://www.tasktool-dot-jp-hiroshima.jp/**`
- `https://tasktool-dot-jp-hiroshima.jp/**`
- `https://task-tool-lbjv.vercel.app/**`

### Email Templates

#### Confirm signup
```html
<h2>アカウント登録の確認</h2>
<p>タスク管理ツールのアカウント登録を完了するには、以下のボタンを押してください。</p>
<p>このメールに心当たりがない場合は、何もせず破棄してください。</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">登録を完了する</a></p>
<p>ボタンが使えない場合は、以下のURLをブラウザに貼り付けてください。</p>
<p>{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email</p>
```

#### Reset Passeord
```html
<h2>パスワード再設定</h2>
<p>タスク管理ツールのパスワードを再設定するには、以下のボタンを押してください。</p>
<p>このメールに心当たりがない場合は、何もせず破棄してください。</p>
<p><a href="{{ .ConfirmationURL }}">パスワードを再設定する</a></p>
<p>ボタンが使えない場合は、以下のURLをブラウザに貼り付けてください。</p>
<p>{{ .ConfirmationURL }}</p>
```

#### 備考
- signup 確認メールは /auth/confirm?token_hash=...&type=email
- reset password メールは {{ .ConfirmationURL }} を使用
- forgot-password の redirectTo は /reset-password

---

## 4. Cloudflare Turnstile 設定

### 本番用 widget
- widget 名:dotjp-task-tool-dev
- sitekey:0x4AAAAAACwZ3uXIKVJyZvoe
- secret:0x4AAAAAACwZ3q3yLk-lOhqPtgZUIy8lOnY
- 用途:
  - Production用
  - Preview 用

### 登録 hostname
- `www.tasktool-dot-jp-hiroshima.jp`
- `tasktool-dot-jp-hiroshima.jp`
- `task-tool-lbjv.vercel.app`
- `localhost`

### 備考
- 本番は正常動作確認済み
- Preview は必要に応じて別 widget を検討
- Pre-clearance:OFF

---

## 5. ドメイン / DNS 設定

### DNS 管理
- 管理サービス:お名前.com
  - ネームサーバー:
    - 01.dnsv.jp
    - 02.dnsv.jp
    - 03.dnsv.jp
    - 04.dnsv.jp

### レコード
#### @
- Type: A
- Value: 216.198.79.1
#### www
- Type: CNAME
- Value: 3ae1a3f254b6b2d6.vercel-dns-017.com

### Vercel Domain 構成
- `tasktool-dot-jp-hiroshima.jp`
  - `www.tasktool-dot-jp-hiroshima.jp` に redirect
- `www.tasktool-dot-jp-hiroshima.jp`
  - Production 接続
- `task-tool-lbjv.vercel.app`
  - Preview 接続

---

## 6. 認証まわりのコード上のポイント

### getBaseUrl
- ファイル:`lib/env/getBaseUrl.ts`
- 用途:
  - reset password の redirectTo 生成
  - 本番/開発で URL を統一

### forgot-password
- resetPasswordForEmail() に渡す redirectTo
  - const redirectTo = `${getBaseUrl()}/reset-password`;

### auth confirm route
- ファイル:`app/auth/confirm/route.ts`
- 用途:
  - token_hash + type で verifyOtp
  - email 確認後は /login に戻す

### TurnstileWidget
- 再マウントで無限ループしないように修正済み
- callback は ref 経由で保持
- 親側も useCallback を使用

---

## 7. 本番確認済み項目

### ドメイン・アクセス
- `https://www.tasktool-dot-jp-hiroshima.jp/` でアクセス可能
- / から /login に遷移
- DNS / SSL 安定

### 認証
- signup → confirm → login
- forgot-password → reset-password → login
- Turnstile（本番）成功
- 未ログインで /dashboard → /login
- ログイン済みで /login → /dashboard
- ログイン済みで /signup → /dashboard

---

## 8. 注意点
- 旧 Vercel Project は使用しない
- 本番設定を変えるときは Production の env を確認してから変更する
- NEXT_PUBLIC_SITE_URL は必ず `https://www.tasktool-dot-jp-hiroshima.jp`
- Turnstile の hostname は www あり/なし両方を登録する
- signup テストは毎回未使用メールで行うのが安全
  - 既存メールアドレスで再テストすると、使用済み/期限切れリンクと混線しやすい

## 9. 今後の改善候補
- Preview 用 Turnstile の安定化
- 本番用の設定変更手順書を簡略化
- 障害時の切り分け手順の整備
- 初期管理者作成・運用手順の文書化