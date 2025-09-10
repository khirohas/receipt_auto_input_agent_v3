/**
 * Gemini API 構造化データ出力テスト
 * 
 * 画像から構造化データを正確に出力できるかテストします
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Gemini API設定
const API_KEY = 'AIzaSyDj1gkKR8xUfQiSyxTQ03cQH7foHJsUWU8';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-1.5-flash',
  generationConfig: {
    maxOutputTokens: 2000,
    temperature: 0.1
  }
});

// テスト用の構造化プロンプト
const STRUCTURED_PROMPT = `あなたは領収書のOCR処理専門AIです。以下の情報を正確に抽出してください：

【抽出対象】
- 支払先（店名・会社名など）
- 日付（yyyy/mm/dd形式に変換）
- 小計（税抜金額、数値のみ）
- 消費税（数値のみ、軽減税率がある場合は標準税率と軽減税率を分けて記載）
- 軽減税率（軽減税率の消費税額、数値のみ、ない場合は0）
- 合計金額（税込金額、数値のみ）
- 品目詳細（具体的な商品名・サービス名と金額のリスト）
- インボイス登録番号（Tの後に13数字からなる番号、見当たらない場合は「未記載」）
- 支払い方法（現金・クレジットカード・電子マネーなど）
- 領収書名義（記載があれば）
- 備考（特記がある場合のみ）

【品目リスト】
飲食費／交通費／宿泊費／備品費／通信費／消耗品費／印刷製本費／会場費／雑費／交際費

【出力形式】
JSON形式で以下の構造で返してください：
{
  "payee": "支払先名",
  "date": "yyyy/mm/dd",
  "subtotal": 小計（数値）,
  "tax": 消費税（数値）,
  "reduced_tax": 軽減税率（数値、ない場合は0）,
  "amount": 合計金額（数値）,
  "items": [
    {
      "name": "商品名・サービス名",
      "amount": 金額（数値）,
      "category": "品目（品目リストから選択）"
    }
  ],
  "invoice_number": "インボイス登録番号（空文字列可）",
  "payment_method": "支払い方法（空文字列可）",
  "receipt_name": "領収書名義（空文字列可）",
  "remarks": "備考（空文字列可）"
}

注意：
- 日付は必ずyyyy/mm/dd形式で、金額は数値のみで返してください。
- 品目は品目リストから最も適切なものを選択してください。
- 軽減税率がある場合は、標準税率と軽減税率を分けて記載してください。
- 品目名は具体的で分かりやすい商品名・サービス名を記載してください。

この領収書画像から必要な情報を抽出してください。品目名は具体的に記載し、会計科目判定の指針に従って適切な品目カテゴリを選択してください。`;

// 画像前処理関数
async function preprocessImage(imageBuffer) {
  try {
    console.log(`📷 元画像サイズ: ${imageBuffer.length} bytes`);
    
    // 画像情報を取得
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`📐 元画像サイズ: ${metadata.width}x${metadata.height}, 形式: ${metadata.format}`);
    
    // 画像をリサイズ・圧縮
    const processedBuffer = await sharp(imageBuffer)
      .resize(1024, 1024, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ 
        quality: 80,
        progressive: true
      })
      .toBuffer();
    
    console.log(`📷 処理後サイズ: ${processedBuffer.length} bytes`);
    console.log(`📊 圧縮率: ${((1 - processedBuffer.length / imageBuffer.length) * 100).toFixed(1)}%`);
    
    return processedBuffer;
  } catch (error) {
    console.error('❌ 画像前処理エラー:', error.message);
    return imageBuffer; // エラーの場合は元の画像を返す
  }
}

// テスト関数
async function testGeminiStructuredOutput() {
  try {
    console.log('🧪 Gemini API 構造化データ出力テスト開始');
    console.log('=' .repeat(50));
    
    // 1. ヘルスチェック
    console.log('1. ヘルスチェック...');
    const healthResult = await model.generateContent('Hello');
    const healthResponse = await healthResult.response;
    console.log('✅ ヘルスチェック成功:', healthResponse.text().substring(0, 50) + '...');
    
    // 2. 構造化データ出力テスト（テキストのみ）
    console.log('\n2. 構造化データ出力テスト（テキストのみ）...');
    const textPrompt = `以下の領収書情報をJSON形式で構造化してください：

支払先: サンプル商店
日付: 2024/09/10
小計: 1000
消費税: 100
合計金額: 1100
品目: 文房具 500円、コピー用紙 500円

上記の情報を指定されたJSON形式で出力してください。`;
    
    const textResult = await model.generateContent(textPrompt);
    const textResponse = await textResult.response;
    console.log('📝 テキストレスポンス:');
    console.log(textResponse.text());
    
    // 3. 画像処理テスト（サンプル画像がある場合）
    console.log('\n3. 画像処理テスト...');
    const sampleImages = [
      'uploads/1757312078515-IMG_2475.jpeg',
      'uploads/1757312083161-IMG_2476.jpeg',
      'uploads/1757312083163-IMG_2477.jpeg',
      'uploads/1757312083164-IMG_2478.jpeg'
    ];
    
    for (const imagePath of sampleImages) {
      const fullPath = path.join(__dirname, imagePath);
      if (fs.existsSync(fullPath)) {
        console.log(`\n📷 画像処理テスト: ${imagePath}`);
        
        try {
          const imageBuffer = fs.readFileSync(fullPath);
          
          // 画像前処理を実行
          console.log('\n🔧 画像前処理を実行中...');
          const processedImageBuffer = await preprocessImage(imageBuffer);
          
          const imageData = {
            inlineData: {
              data: processedImageBuffer.toString('base64'),
              mimeType: 'image/jpeg'
            }
          };
          
          const imageResult = await model.generateContent([
            STRUCTURED_PROMPT,
            imageData
          ]);
          
          const imageResponse = await imageResult.response;
          const content = imageResponse.text();
          
          console.log('✅ 画像処理成功');
          console.log('📊 レスポンス長:', content.length, '文字');
          console.log('📋 レスポンス内容:');
          console.log(content.substring(0, 500) + '...');
          
          // JSONパーステスト
          try {
            const cleanedContent = content.replace(/```json\s*/, '').replace(/```\s*$/, '');
            const parsed = JSON.parse(cleanedContent);
            console.log('✅ JSONパース成功');
            console.log('📋 構造化データ:', JSON.stringify(parsed, null, 2));
          } catch (parseError) {
            console.log('❌ JSONパースエラー:', parseError.message);
            console.log('🔍 パースしようとした内容:', cleanedContent.substring(0, 200));
          }
          
          // 2秒待機（レート制限回避）
          console.log('⏳ レート制限回避のため2秒待機中...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (imageError) {
          console.log('❌ 画像処理エラー:', imageError.message);
          
          // エラーの詳細を確認
          if (imageError.message.includes('429')) {
            console.log('⚠️  レート制限エラー - しばらく待ってから再試行してください');
          } else if (imageError.message.includes('quota')) {
            console.log('⚠️  クォータ制限エラー - 利用制限に達しています');
          } else if (imageError.message.includes('SAFETY')) {
            console.log('⚠️  安全性フィルターエラー - 画像がブロックされました');
          }
        }
        
        break; // 最初の画像のみテスト
      }
    }
    
    console.log('\n' + '=' .repeat(50));
    console.log('🎉 テスト完了');
    
  } catch (error) {
    console.error('❌ テストエラー:', error);
    
    if (error.message.includes('429')) {
      console.log('💡 解決策: しばらく待ってから再試行してください');
    } else if (error.message.includes('quota')) {
      console.log('💡 解決策: Google Cloud Consoleで課金を有効化してください');
    } else if (error.message.includes('API key')) {
      console.log('💡 解決策: APIキーを確認してください');
    }
  }
}

// テスト実行
if (require.main === module) {
  testGeminiStructuredOutput();
}

module.exports = { testGeminiStructuredOutput };
