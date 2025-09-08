require('dotenv').config();
const fs = require('fs');
const OpenAI = require('openai');

// OpenAI設定
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// テスト用の画像パス（sample-imagesディレクトリ内の画像を指定）
const TEST_IMAGE_PATH = './sample-images/レシート_イオン.jpg'; // 実際の画像ファイル名に変更してください

// 品目リスト
const ITEM_CATEGORIES = [
  '飲食費', '交通費', '宿泊費', '備品費', '通信費', 
  '消耗品費', '印刷製本費', '会場費', '雑費', '交際費'
];

async function testOCR() {
  try {
    // 画像ファイルの存在確認
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.error(`❌ テスト画像が見つかりません: ${TEST_IMAGE_PATH}`);
      console.log('📁 sample-imagesディレクトリにテスト用の画像を配置してください');
      return;
    }

    console.log('🔍 画像を読み込み中...');
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    const base64Image = imageBuffer.toString('base64');
    console.log(`✅ 画像読み込み完了: ${TEST_IMAGE_PATH}`);

    console.log('🤖 GPT-4oに画像を送信中...');
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `あなたは領収書のOCR処理専門AIです。以下の情報を正確に抽出してください：

【抽出対象】
- 支払先（店名・会社名など）
- 日付（yyyy/mm/dd形式に変換）
- 金額（数値のみ）
- 品目（以下のリストから最も適切なものを選択）
- 備考（特記がある場合のみ）

【品目リスト】
${ITEM_CATEGORIES.join('／')}

【出力形式】
JSON形式で以下の構造で返してください：
{
  "payee": "支払先名",
  "date": "yyyy/mm/dd",
  "amount": 数値,
  "category": "品目",
  "remarks": "備考（空文字列可）"
}

注意：日付は必ずyyyy/mm/dd形式で、金額は数値のみで返してください。`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この領収書画像から必要な情報を抽出してください。"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    console.log('✅ GPT-4oからの応答を受信しました');
    
    const content = response.choices[0].message.content;
    console.log('\n📄 生の応答:');
    console.log(content);
    
    // JSONとしてパースを試行（マークダウンのコードブロック記号を除去）
    try {
      let jsonContent = content.trim();
      
      // マークダウンのコードブロック記号を除去
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\s*/, '');
      }
      if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\s*/, '');
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.replace(/\s*```$/, '');
      }
      
      const parsedData = JSON.parse(jsonContent);
      console.log('\n📊 パース済みデータ:');
      console.log(JSON.stringify(parsedData, null, 2));
      
      // データの検証
      console.log('\n🔍 データ検証:');
      console.log(`支払先: ${parsedData.payee || '❌ 未取得'}`);
      console.log(`日付: ${parsedData.date || '❌ 未取得'}`);
      console.log(`金額: ${parsedData.amount || '❌ 未取得'}`);
      console.log(`品目: ${parsedData.category || '❌ 未取得'}`);
      console.log(`備考: ${parsedData.remarks || 'なし'}`);
      
    } catch (parseError) {
      console.log('\n❌ JSONパースエラー:');
      console.log(parseError.message);
      console.log('GPT-4oの応答がJSON形式ではありませんでした');
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:');
    console.error(error.message);
    
    if (error.code === 'ENOENT') {
      console.log('\n💡 解決方法:');
      console.log('1. sample-imagesディレクトリにテスト用の画像を配置してください');
      console.log('2. TEST_IMAGE_PATHの値を実際の画像ファイル名に変更してください');
    } else if (error.status === 401) {
      console.log('\n💡 解決方法:');
      console.log('OpenAI APIキーが無効です。.envファイルのAPIキーを確認してください');
    } else if (error.status === 429) {
      console.log('\n💡 解決方法:');
      console.log('API利用制限に達しました。しばらく待ってから再試行してください');
    }
  }
}

// テスト実行
console.log('🚀 OCRテストを開始します...\n');
testOCR(); 