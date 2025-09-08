require('dotenv').config();
const fs = require('fs');
const OpenAI = require('openai');
const ExcelJS = require('exceljs');

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

async function processReceiptOCR(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `あなたは領収書のOCR処理専門AIです。以下の情報を正確に抽出してください：\n\n【抽出対象】\n- 支払先（店名・会社名など）\n- 日付（yyyy/mm/dd形式に変換）\n- 金額（数値のみ）\n- 品目（以下のリストから最も適切なものを選択）\n- 備考（特記がある場合のみ）\n\n【品目リスト】\n${ITEM_CATEGORIES.join('／')}\n\n【出力形式】\nJSON形式で以下の構造で返してください：\n{\n  "payee": "支払先名",\n  "date": "yyyy/mm/dd",\n  "amount": 数値,\n  "category": "品目",\n  "remarks": "備考（空文字列可）"\n}\n\n注意：日付は必ずyyyy/mm/dd形式で、金額は数値のみで返してください。`
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

  let content = response.choices[0].message.content.trim();
  // マークダウンのコードブロック記号を除去
  if (content.startsWith('```json')) content = content.replace(/^```json\s*/, '');
  if (content.startsWith('```')) content = content.replace(/^```\s*/, '');
  if (content.endsWith('```')) content = content.replace(/\s*```$/, '');

  return JSON.parse(content);
}

async function generateExcelFile(receiptData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('領収書');

  worksheet.columns = [
    { header: 'No.', key: 'no', width: 5 },
    { header: '支払先', key: 'payee', width: 20 },
    { header: '日付', key: 'date', width: 12 },
    { header: '金額', key: 'amount', width: 12 },
    { header: '品目', key: 'category', width: 12 },
    { header: '備考', key: 'remarks', width: 20 }
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  let totalAmount = 0;
  receiptData.forEach((receipt, index) => {
    const rowNumber = index + 2;
    const row = worksheet.addRow({
      no: index + 1,
      payee: receipt.payee,
      date: receipt.date,
      amount: receipt.amount,
      category: receipt.category,
      remarks: receipt.remarks || ''
    });
    if (rowNumber % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' }
      };
    } else {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }
    row.getCell('amount').numFmt = '¥#,##0';
    totalAmount += receipt.amount;
  });

  const totalRow = worksheet.addRow({
    no: '',
    payee: '',
    date: '合計',
    amount: totalAmount,
    category: '',
    remarks: ''
  });
  totalRow.getCell('date').font = { bold: true };
  totalRow.getCell('amount').font = { bold: true };
  totalRow.getCell('amount').numFmt = '¥#,##0';

  const fileName = 'test_receipt.xlsx';
  await workbook.xlsx.writeFile(fileName);
  console.log(`✅ Excelファイルを出力しました: ${fileName}`);
}

(async () => {
  try {
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      console.error(`❌ テスト画像が見つかりません: ${TEST_IMAGE_PATH}`);
      return;
    }
    console.log('🚀 画像→GPT-4o→Excel自動連携テスト開始');
    const ocrResult = await processReceiptOCR(TEST_IMAGE_PATH);
    console.log('✅ OCR抽出結果:', ocrResult);
    await generateExcelFile([ocrResult]);
  } catch (err) {
    console.error('❌ エラー:', err.message);
  }
})(); 