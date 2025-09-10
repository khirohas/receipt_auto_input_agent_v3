/**
 * Gemini API テキストのみテスト
 * 
 * 画像なしでテキストのみのリクエストが通るかテストします
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini API設定
const API_KEY = 'AIzaSyDj1gkKR8xUfQiSyxTQ03cQH7foHJsUWU8';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  generationConfig: {
    maxOutputTokens: 1000,
    temperature: 0.1
  }
});

// テスト関数
async function testGeminiTextOnly() {
  try {
    console.log('🧪 Gemini API テキストのみテスト開始');
    console.log('=' .repeat(50));
    
    // 1. 簡単なテキストテスト
    console.log('1. 簡単なテキストテスト...');
    const simpleResult = await model.generateContent('Hello, how are you?');
    const simpleResponse = await simpleResult.response;
    console.log('✅ 簡単なテキスト成功:', simpleResponse.text());
    
    // 2. 構造化データ出力テスト（テキストのみ）
    console.log('\n2. 構造化データ出力テスト（テキストのみ）...');
    const structuredPrompt = `以下の領収書情報をJSON形式で構造化してください：

支払先: サンプル商店
日付: 2024/09/10
小計: 1000
消費税: 100
合計金額: 1100
品目: 文房具 500円、コピー用紙 500円

上記の情報を以下のJSON形式で出力してください：
{
  "payee": "支払先名",
  "date": "yyyy/mm/dd",
  "subtotal": 小計（数値）,
  "tax": 消費税（数値）,
  "amount": 合計金額（数値）,
  "items": [
    {
      "name": "商品名",
      "amount": 金額（数値）,
      "category": "品目カテゴリ"
    }
  ]
}`;
    
    const structuredResult = await model.generateContent(structuredPrompt);
    const structuredResponse = await structuredResult.response;
    console.log('✅ 構造化データ出力成功:');
    console.log(structuredResponse.text());
    
    // 3. JSONパーステスト
    console.log('\n3. JSONパーステスト...');
    const content = structuredResponse.text();
    try {
      const cleanedContent = content.replace(/```json\s*/, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanedContent);
      console.log('✅ JSONパース成功:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.log('❌ JSONパースエラー:', parseError.message);
      console.log('🔍 パースしようとした内容:', content.substring(0, 200));
    }
    
    // 4. 複数回のリクエストテスト
    console.log('\n4. 複数回のリクエストテスト...');
    for (let i = 1; i <= 3; i++) {
      console.log(`\n📝 リクエスト ${i}/3...`);
      const testResult = await model.generateContent(`テストメッセージ ${i}: 現在時刻は？`);
      const testResponse = await testResult.response;
      console.log(`✅ リクエスト ${i} 成功:`, testResponse.text().substring(0, 50) + '...');
      
      // 1秒待機
      if (i < 3) {
        console.log('⏳ 1秒待機中...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 テキストのみテスト完了 - Gemini APIは正常に動作しています！');
    
  } catch (error) {
    console.error('❌ テストエラー:', error);
    
    if (error.message.includes('429')) {
      console.log('💡 解決策: しばらく待ってから再試行してください');
      console.log('⏰ 推奨待機時間: 1分以上');
    } else if (error.message.includes('quota')) {
      console.log('💡 解決策: Google Cloud Consoleで課金を有効化してください');
    } else if (error.message.includes('API key')) {
      console.log('💡 解決策: APIキーを確認してください');
    }
  }
}

// テスト実行
if (require.main === module) {
  testGeminiTextOnly();
}

module.exports = { testGeminiTextOnly };
