# 領収書自動入力エージェント v3 - デプロイメントガイド

## 概要
このアプリケーションは領収書画像をアップロードし、AI（OpenAI GPT-4o）を使用してOCR処理を行い、会計科目を自動判定してExcelファイルを生成するサービスです。

## デプロイ方法（Vercel推奨）

### 1. 前提条件
- Vercelアカウント（無料）
- OpenAI APIキー
- GitHubアカウント（推奨）

### 2. 環境変数の設定
Vercelダッシュボードで以下の環境変数を設定してください：

```
OPENAI_API_KEY=your_openai_api_key_here
NODE_ENV=production
```

### 3. デプロイ手順

#### 方法A: Vercel CLIを使用
```bash
# Vercel CLIをインストール
npm i -g vercel

# プロジェクトディレクトリに移動
cd /path/to/project

# ログイン
vercel login

# デプロイ
vercel --prod
```

#### 方法B: GitHub連携（推奨）
1. プロジェクトをGitHubリポジトリにプッシュ
2. Vercelダッシュボードで「New Project」
3. GitHubリポジトリを選択
4. 環境変数を設定
5. デプロイ

### 4. 設定の最適化

#### vercel.json設定内容
- **maxDuration**: 60秒（OCR処理時間を考慮）
- **regions**: nrt1（東京リージョン）
- **routes**: 全リクエストをserver.jsにルーティング

#### パフォーマンス考慮事項
- ファイルアップロード: 一時的なストレージ使用
- OCR処理: OpenAI API呼び出し（最大60秒）
- Excel生成: メモリ内処理

### 5. セキュリティ設定

#### 推奨設定
- 環境変数はVercelダッシュボードで管理
- APIキーは絶対にコードに含めない
- 必要に応じてCORS設定を調整

### 6. 監視とメンテナンス

#### ログ確認
- Vercelダッシュボードの「Functions」タブ
- リアルタイムログの確認

#### エラー対応
- OpenAI API制限の確認
- ファイルサイズ制限の確認
- メモリ使用量の監視

### 7. スケーリング

#### 現在の制限（無料プラン）
- 関数実行時間: 最大60秒
- 同時実行数: 制限あり
- 月間リクエスト数: 制限あり

#### 本格運用時の考慮事項
- Proプランへのアップグレード
- データベースの導入検討
- ファイルストレージの外部化

## トラブルシューティング

### よくある問題
1. **OpenAI APIキーエラー**: 環境変数の設定を確認
2. **タイムアウトエラー**: 画像サイズを縮小
3. **メモリエラー**: 同時処理数を制限

### サポート
- Vercelドキュメント: https://vercel.com/docs
- OpenAI APIドキュメント: https://platform.openai.com/docs
