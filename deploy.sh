#!/bin/bash

# 領収書自動入力エージェント v3 - デプロイスクリプト

echo "🚀 領収書自動入力エージェント v3 デプロイを開始します..."

# 依存関係のインストール
echo "📦 依存関係をインストール中..."
npm install

# 環境変数のチェック
echo "🔍 環境変数をチェック中..."
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ エラー: OPENAI_API_KEY環境変数が設定されていません"
    echo "以下のコマンドで設定してください:"
    echo "export OPENAI_API_KEY=your_api_key_here"
    exit 1
fi

# Vercel CLIのインストール確認
if ! command -v vercel &> /dev/null; then
    echo "📥 Vercel CLIをインストール中..."
    npm install -g vercel
fi

# Vercelにログイン確認
echo "🔐 Vercelにログイン中..."
vercel login

# 本番環境にデプロイ
echo "🚀 本番環境にデプロイ中..."
vercel --prod

echo "✅ デプロイが完了しました！"
echo "🌐 アプリケーションURL: https://your-project-name.vercel.app"
echo "📊 ダッシュボード: https://vercel.com/dashboard"
