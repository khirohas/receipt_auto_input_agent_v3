const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const LLMFactory = require('./services/llm/llm-factory');
const { getConfigInfo } = require('./config/llm-config');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS設定を本番環境に最適化
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://*.vercel.app', 'https://receipt-auto-input-agent.vercel.app'] 
    : true,
  credentials: true
}));

// 静的ファイルの配信（ルートパスより前に配置）
app.use(express.static(path.join(__dirname, 'public')));

// リクエストサイズ制限を設定（Vercel制限内）
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// LLM設定とインスタンス初期化
let llmService;
try {
  llmService = LLMFactory.createDefaultLLM();
  console.log(`LLMサービス初期化完了: ${llmService.getProviderName()} (${llmService.getModelName()})`);
} catch (error) {
  console.error('LLMサービスの初期化に失敗しました:', error.message);
  console.error('利用可能なプロバイダー:', LLMFactory.getAvailableProviders());
  process.exit(1);
}

// ルートエンドポイント
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ヘルスチェックエンドポイント
app.get('/health', async (req, res) => {
  try {
    const llmHealth = await llmService.healthCheck();
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      llm: {
        provider: llmService.getProviderName(),
        model: llmService.getModelName(),
        healthy: llmHealth
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// LLM設定情報エンドポイント
app.get('/api/llm-info', (req, res) => {
  try {
    const configInfo = getConfigInfo();
    const providerInfo = LLMFactory.getAllProviderInfo();
    res.json({
      config: configInfo,
      providers: providerInfo,
      current: {
        provider: llmService.getProviderName(),
        model: llmService.getModelName(),
        capabilities: llmService.getCapabilities()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 科目データ（構造化データ）
const ACCOUNT_DATA = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'accounting_master.json'), 'utf8')
);

// 科目データから科目コードと名称を取得する関数
function getAccountInfo(itemName) {
  // 品目名から適切な科目を判定するロジック
  const itemNameLower = itemName.toLowerCase();
  const master = ACCOUNT_DATA["勘定科目_補助科目_統合システム"];

  // 1. マスタデータからキーワード一致で探す（補助科目名優先→科目名）
  for (const sectionKey of ["資産の部", "損益の部"]) {
    const section = master[sectionKey];
    if (!section) continue;
    for (const groupKey in section) {
      const group = section[groupKey];
      for (const mainKey in group) {
        const main = group[mainKey];
        for (const accountKey in main) {
          const account = main[accountKey];
          // 勘定科目名一致
          if (account["勘定科目名"] && itemNameLower.includes(account["勘定科目名"].toLowerCase())) {
            // 補助科目があれば最初を返す
            if (account["補助科目"] && account["補助科目"].length > 0) {
              return {
                accountCode: account["勘定科目コード"] || accountKey.split("_")[0],
                accountName: account["勘定科目名"],
                subAccountCode: account["補助科目"][0].code,
                subAccountName: account["補助科目"][0].name
              };
            } else {
              return {
                accountCode: account["勘定科目コード"] || accountKey.split("_")[0],
                accountName: account["勘定科目名"],
                subAccountCode: '',
                subAccountName: ''
              };
            }
          }
          // 補助科目名一致
          if (account["補助科目"]) {
            for (const sub of account["補助科目"]) {
              if (itemNameLower.includes(sub.name.toLowerCase())) {
                return {
                  accountCode: account["勘定科目コード"] || accountKey.split("_")[0],
                  accountName: account["勘定科目名"],
                  subAccountCode: sub.code,
                  subAccountName: sub.name
                };
              }
            }
          }
        }
      }
    }
  }

  // 2. 詳細なキーワード判定（画像の品目に対応）
  
  // 絵本・おもちゃ・保育関連
  if (itemNameLower.includes('絵本') || itemNameLower.includes('えほん') || 
      itemNameLower.includes('おもちゃ') || itemNameLower.includes('チョッキ') ||
      itemNameLower.includes('あおむし') || itemNameLower.includes('ほっとけーき') ||
      itemNameLower.includes('てんぷら') || itemNameLower.includes('もこもこ') ||
      itemNameLower.includes('保育') || itemNameLower.includes('子供') ||
      itemNameLower.includes('児童') || itemNameLower.includes('幼児')) {
    return {
      accountCode: "72640",
      accountName: "原価消耗品費",
      subAccountCode: "0013",
      subAccountName: "保育材料費"
    };
  }

  // 食材・食品関連
  if (itemNameLower.includes('鶏') || itemNameLower.includes('豚') || 
      itemNameLower.includes('肉') || itemNameLower.includes('野菜') ||
      itemNameLower.includes('玉ねぎ') || itemNameLower.includes('にんじん') ||
      itemNameLower.includes('じゃがいも') || itemNameLower.includes('牛乳') ||
      itemNameLower.includes('食パン') || itemNameLower.includes('卵') ||
      itemNameLower.includes('バナナ') || itemNameLower.includes('せんべい') ||
      itemNameLower.includes('ゼリー') || itemNameLower.includes('プリン') ||
      itemNameLower.includes('麦茶') || itemNameLower.includes('食材') ||
      itemNameLower.includes('食品') || itemNameLower.includes('冷凍')) {
    return {
      accountCode: "72120",
      accountName: "一般商品仕入高",
      subAccountCode: "0007",
      subAccountName: "食材仕入"
    };
  }

  // 写真・ビデオ撮影関連
  if (itemNameLower.includes('写真') || itemNameLower.includes('ビデオ') || 
      itemNameLower.includes('撮影') || itemNameLower.includes('編集') ||
      itemNameLower.includes('フォト') || itemNameLower.includes('工房')) {
    return {
      accountCode: "74510",
      accountName: "広告宣伝費",
      subAccountCode: "0001",
      subAccountName: "広告宣伝費"
    };
  }

  // 交通費関連
  if (itemNameLower.includes('交通費') || itemNameLower.includes('運搬') || 
      itemNameLower.includes('機材') || itemNameLower.includes('移動')) {
    return {
      accountCode: "74530",
      accountName: "旅費交通費",
      subAccountCode: "0004",
      subAccountName: "出張旅費"
    };
  }

  // 3. 既存のキーワード判定（従来ロジック）
  if (itemNameLower.includes('文房具') || itemNameLower.includes('ペン') || 
      itemNameLower.includes('ノート') || itemNameLower.includes('紙') ||
      itemNameLower.includes('クリップ') || itemNameLower.includes('ファイル') ||
      itemNameLower.includes('名刺') || itemNameLower.includes('封筒') ||
      itemNameLower.includes('コピー') || itemNameLower.includes('印刷') ||
      itemNameLower.includes('写真') || itemNameLower.includes('フィルム') ||
      itemNameLower.includes('清掃') || itemNameLower.includes('掃除')) {
    return {
      accountCode: "74610",
      accountName: "消耗品費",
      subAccountCode: "0001",
      subAccountName: "事務用消耗品代"
    };
  }
  if (itemNameLower.includes('切手') || itemNameLower.includes('はがき') || 
      itemNameLower.includes('郵送') || itemNameLower.includes('郵便')) {
    return {
      accountCode: "74620",
      accountName: "通信費",
      subAccountCode: "0001",
      subAccountName: "切手代"
    };
  }
  if (itemNameLower.includes('電話') || itemNameLower.includes('ファックス') || 
      itemNameLower.includes('携帯') || itemNameLower.includes('回線') ||
      itemNameLower.includes('電報')) {
    return {
      accountCode: "74630",
      accountName: "支払電話料",
      subAccountCode: "0001",
      subAccountName: "電話料"
    };
  }
  if (itemNameLower.includes('電車') || itemNameLower.includes('バス') || 
      itemNameLower.includes('タクシー') || itemNameLower.includes('定期') ||
      itemNameLower.includes('航空券') || itemNameLower.includes('乗車券') ||
      itemNameLower.includes('出張') || itemNameLower.includes('旅費')) {
    return {
      accountCode: "74530",
      accountName: "旅費交通費",
      subAccountCode: "0001",
      subAccountName: "通勤定期代"
    };
  }
  if (itemNameLower.includes('ガソリン') || itemNameLower.includes('有料道路') || 
      itemNameLower.includes('駐車') || itemNameLower.includes('車検') ||
      itemNameLower.includes('部品')) {
    return {
      accountCode: "74540",
      accountName: "車両費",
      subAccountCode: "0001",
      subAccountName: "ガソリン代"
    };
  }
  if (itemNameLower.includes('電気') || itemNameLower.includes('水道') || 
      itemNameLower.includes('ガス') || itemNameLower.includes('光熱') ||
      itemNameLower.includes('灯油') || itemNameLower.includes('燃料')) {
    return {
      accountCode: "74340",
      accountName: "水道光熱費",
      subAccountCode: "0002",
      subAccountName: "電気代"
    };
  }
  if (itemNameLower.includes('家賃') || itemNameLower.includes('賃借') || 
      itemNameLower.includes('駐車場') || itemNameLower.includes('土地')) {
    return {
      accountCode: "74310",
      accountName: "地代家賃",
      subAccountCode: "0001",
      subAccountName: "支店事務所家賃"
    };
  }
  if (itemNameLower.includes('手数料') || itemNameLower.includes('振込') || 
      itemNameLower.includes('報酬') || itemNameLower.includes('顧問') ||
      itemNameLower.includes('監査') || itemNameLower.includes('委託')) {
    return {
      accountCode: "74590",
      accountName: "支払手数料",
      subAccountCode: "0001",
      subAccountName: "振込手数料"
    };
  }
  // デフォルト（消耗品費）
  return {
    accountCode: "74610",
    accountName: "消耗品費",
    subAccountCode: "0001",
    subAccountName: "事務用消耗品代"
  };
}

// ファイルアップロードAPI（Vercel対応）
const uploadSingle = multer({
  storage: multer.memoryStorage(), // メモリストレージを使用
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロード可能です'));
    }
  }
});

// メモリ内でファイルを管理
const fileStorage = new Map();

app.post('/api/upload', uploadSingle.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません' });
    }
    
    const fileId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    
    console.log(`ファイルアップロード: ${originalName} (${req.file.size} bytes)`);
    
    // メモリに保存
    fileStorage.set(fileId, {
      buffer: req.file.buffer,
      originalname: originalName,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadTime: new Date()
    });
    
    console.log(`ファイル保存完了: ${fileId} - 現在のファイル数: ${fileStorage.size}`);
    
    res.json({ success: true, file: fileId, originalName: originalName });
  } catch (error) {
    console.error('アップロード処理エラー:', error);
    res.status(500).json({ error: 'アップロード処理中にエラーが発生しました: ' + error.message });
  }
});

// ファイルリスト取得API
app.get('/api/files', (req, res) => {
  const files = Array.from(fileStorage.entries()).map(([fileId, fileData]) => ({
    id: fileId,
    name: fileData.originalname,
    size: fileData.size,
    date: fileData.uploadTime
  }));
  console.log(`ファイルリスト取得: ${files.length}件`);
  res.json(files);
});

// 品目リスト
const ITEM_CATEGORIES = [
  '飲食費', '交通費', '宿泊費', '備品費', '通信費', 
  '消耗品費', '印刷製本費', '会場費', '雑費', '交際費'
];

// 勘定科目マッピング
const ACCOUNT_MAPPING = {
  '飲食費': '接待交際費',
  '交通費': '旅費交通費',
  '宿泊費': '旅費交通費',
  '備品費': '消耗品費',
  '通信費': '通信費',
  '消耗品費': '消耗品費',
  '印刷製本費': '印刷製本費',
  '会場費': '会議費',
  '雑費': '雑費',
  '交際費': '接待交際費'
};

// OCR処理関数（マルチLLM対応）
async function processReceiptOCR(imageBuffer) {
  try {
    // 会計マスタデータから主要な科目・補助科目の例を抽出
    const master = ACCOUNT_DATA["勘定科目_補助科目_統合システム"];
    let accountExamples = [];
    
    // 主要な科目と補助科目の例を収集
    for (const sectionKey of ["資産の部", "損益の部"]) {
      const section = master[sectionKey];
      if (!section) continue;
      for (const groupKey in section) {
        const group = section[groupKey];
        for (const mainKey in group) {
          const main = group[mainKey];
          for (const accountKey in main) {
            const account = main[accountKey];
            if (account["補助科目"] && account["補助科目"].length > 0) {
              // 最初の3つの補助科目を例として追加
              const examples = account["補助科目"].slice(0, 3).map(sub => 
                `${sub.name} → ${account["勘定科目名"]}`
              );
              accountExamples.push(...examples);
            }
          }
        }
      }
    }

    const prompt = `あなたは領収書のOCR処理専門AIです。以下の情報を正確に抽出してください：

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
${ITEM_CATEGORIES.join('／')}

【会計科目判定の指針】
品目名から適切な勘定科目・補助科目を判定してください。以下の例を参考にしてください：

主要な科目・補助科目の例：
${accountExamples.slice(0, 20).join('\\n')}

具体的な判定例：
- 絵本・おもちゃ → 原価消耗品費-保育材料費
- 文房具・事務用品 → 消耗品費-事務用消耗品代
- 切手・郵便料 → 通信費-切手代
- 電話料・携帯電話料 → 支払電話料-電話料
- 電車・バス・タクシー料金 → 旅費交通費-通勤定期代
- ガソリン・駐車料金 → 車両費-ガソリン代
- 電気代・水道代・ガス代 → 水道光熱費-電気代
- 家賃・賃借料 → 地代家賃-支店事務所家賃
- 手数料・振込手数料 → 支払手数料-振込手数料
- 食材・食品 → 原価消耗品費-食材仕入
- 清掃用品 → 原価消耗品費-介護業務用消耗品代
- 医療用品 → 原価消耗品費-医事業務用消耗品代

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
- 品目名は具体的で分かりやすい商品名・サービス名を記載してください。`;

    console.log(`[OCR] 処理開始 - プロバイダー: ${llmService.getProviderName()}, モデル: ${llmService.getModelName()}`);
    
    // 新しいLLMアーキテクチャを使用
    const result = await llmService.processImage(imageBuffer, prompt);
    
    console.log(`[OCR] 処理完了 - プロバイダー: ${llmService.getProviderName()}`);
    return result;
  } catch (error) {
    console.error('[OCR] 処理エラー:', error);
    throw error;
  }
}

// Excelファイル生成関数
async function generateExcelFile(receiptData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('領収書');
  worksheet.columns = [
    { header: '伝票識別ID', key: 'voucher_id', width: 15 },
    { header: '明細番号', key: 'detail_no', width: 10 },
    { header: '科目コード', key: 'account_code', width: 12 },
    { header: '科目名称', key: 'account_name', width: 15 },
    { header: '補助科目コード', key: 'sub_account_code', width: 15 },
    { header: '補助科目名称', key: 'sub_account_name', width: 20 },
    { header: '支払先', key: 'payee', width: 20 },
    { header: '支払日', key: 'payment_date', width: 12 },
    { header: '品目詳細', key: 'item_details', width: 25 },
    { header: '金額', key: 'amount', width: 15 },
    { header: 'インボイス登録番号', key: 'invoice_number', width: 20 }
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  let rowNumber = 2;
  let totalAmount = 0;
  let detailNoCounter = 1; // 明細番号の連番カウンター
  
  receiptData.forEach((receipt, receiptIndex) => {
    const receiptNo = receiptIndex + 1
    
    // 品目ごとの行を追加
    if (receipt.items && receipt.items.length > 0) {
      receipt.items.forEach((item, itemIndex) => {
        // 科目情報を取得
        const accountInfo = getAccountInfo(item.name);
        
        const row = worksheet.addRow({
          voucher_id: itemIndex === 0 ? String(receiptNo).padStart(3, '0') : '', // 最初の品目のみ伝票識別IDを表示（Rなし）
          detail_no: detailNoCounter++, // 明細番号（連番）
          account_code: accountInfo.accountCode,
          account_name: accountInfo.accountName,
          sub_account_code: accountInfo.subAccountCode,
          sub_account_name: accountInfo.subAccountName,
          payee: itemIndex === 0 ? receipt.payee : '', // 最初の品目のみ支払先を表示
          payment_date: itemIndex === 0 ? receipt.date : '', // 最初の品目のみ支払日を表示
          item_details: item.name,
          amount: item.amount,
          invoice_number: itemIndex === 0 ? (receipt.invoice_number || '未記載') : '' // 最初の品目のみ表示
        });
        
        // 行の背景色を設定
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
        
        row.getCell(10).numFmt = '¥#,##0';
        row.getCell(10).alignment = { horizontal: 'right' };
        // ¥マークを確実に表示するため、文字列として設定
        row.getCell(10).value = `¥${item.amount.toLocaleString()}`;
        rowNumber++;
      });
      
      // 品目エントリーが終わったら小計行を追加
      const subtotalRow = worksheet.addRow({
        voucher_id: '',
        detail_no: '',
        account_code: '',
        account_name: '',
        sub_account_code: '',
        sub_account_name: '',
        payee: '',
        payment_date: '',
        item_details: '小計',
        amount: receipt.subtotal || receipt.amount,
        invoice_number: ''
      });
      
      // 小計行の背景色を設定（薄い青色）
      subtotalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };
      
      subtotalRow.getCell('amount').numFmt = '¥#,##0';
      subtotalRow.getCell('amount').font = { bold: true };
      subtotalRow.getCell('item_details').font = { bold: true };
      subtotalRow.getCell('amount').alignment = { horizontal: 'right' };
      // ¥マークを確実に表示するため、文字列として設定
      subtotalRow.getCell('amount').value = `¥${(receipt.subtotal || receipt.amount).toLocaleString()}`;
      rowNumber++;
      
      // 消費税行を追加
      if (receipt.tax && receipt.tax > 0) {
        // 軽減税率がある場合は二行に分けて表示
        if (receipt.reduced_tax && receipt.reduced_tax > 0) {
          // 標準税率の消費税
          const standardTaxRow = worksheet.addRow({
            voucher_id: '',
            detail_no: '',
            account_code: '',
            account_name: '',
            sub_account_code: '',
            sub_account_name: '',
            payee: '',
            payment_date: '',
            item_details: '消費税（標準税率）',
            amount: receipt.tax - receipt.reduced_tax,
            invoice_number: ''
          });
          standardTaxRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          };
          standardTaxRow.getCell('amount').numFmt = '¥#,##0';
          standardTaxRow.getCell('amount').font = { bold: true };
          standardTaxRow.getCell('item_details').font = { bold: true };
          standardTaxRow.getCell('amount').alignment = { horizontal: 'right' };
          // ¥マークを確実に表示するため、文字列として設定
          standardTaxRow.getCell('amount').value = `¥${(receipt.tax - receipt.reduced_tax).toLocaleString()}`;
          rowNumber++;
          
          // 軽減税率の消費税
          const reducedTaxRow = worksheet.addRow({
            voucher_id: '',
            detail_no: '',
            account_code: '',
            account_name: '',
            sub_account_code: '',
            sub_account_name: '',
            payee: '',
            payment_date: '',
            item_details: '消費税（軽減税率）',
            amount: receipt.reduced_tax,
            invoice_number: ''
          });
          reducedTaxRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          };
          reducedTaxRow.getCell('amount').numFmt = '¥#,##0';
          reducedTaxRow.getCell('amount').font = { bold: true };
          reducedTaxRow.getCell('item_details').font = { bold: true };
          reducedTaxRow.getCell('amount').alignment = { horizontal: 'right' };
          // ¥マークを確実に表示するため、文字列として設定
          reducedTaxRow.getCell('amount').value = `¥${receipt.reduced_tax.toLocaleString()}`;
          rowNumber++;
        } else {
          // 通常の消費税
          const taxRow = worksheet.addRow({
            voucher_id: '',
            detail_no: '',
            account_code: '',
            account_name: '',
            sub_account_code: '',
            sub_account_name: '',
            payee: '',
            payment_date: '',
            item_details: '消費税',
            amount: receipt.tax,
            invoice_number: ''
          });
          taxRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          };
          taxRow.getCell('amount').numFmt = '¥#,##0';
          taxRow.getCell('amount').font = { bold: true };
          taxRow.getCell('item_details').font = { bold: true };
          taxRow.getCell('amount').alignment = { horizontal: 'right' };
          // ¥マークを確実に表示するため、文字列として設定
          taxRow.getCell('amount').value = `¥${receipt.tax.toLocaleString()}`;
          rowNumber++;
        }
      }
      
      // 合計金額（税込）行を追加
      const totalRow = worksheet.addRow({
        voucher_id: '',
        detail_no: '',
        account_code: '',
        account_name: '',
        sub_account_code: '',
        sub_account_name: '',
        payee: '',
        payment_date: '',
        item_details: '合計金額（税込）',
        amount: receipt.amount,
        invoice_number: ''
      });
      
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCE5FF' }
      };
      totalRow.getCell('amount').numFmt = '¥#,##0';
      totalRow.getCell('amount').font = { bold: true };
      totalRow.getCell('item_details').font = { bold: true };
      totalRow.getCell('amount').alignment = { horizontal: 'right' };
      // ¥マークを確実に表示するため、文字列として設定
      totalRow.getCell('amount').value = `¥${receipt.amount.toLocaleString()}`;
      rowNumber++;
      
    } else {
      // itemsがない場合は従来の形式で表示
      const accountInfo = getAccountInfo(receipt.item_details || '');
      const row = worksheet.addRow({
        voucher_id: String(receiptNo).padStart(3, '0'),
        detail_no: detailNoCounter++,
        account_code: accountInfo.accountCode,
        account_name: accountInfo.accountName,
        sub_account_code: accountInfo.subAccountCode,
        sub_account_name: accountInfo.subAccountName,
        payee: receipt.payee,
        payment_date: receipt.date,
        item_details: receipt.item_details || '',
        amount: receipt.amount,
        invoice_number: receipt.invoice_number || '未記載'
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
      row.getCell('amount').alignment = { horizontal: 'right' };
      rowNumber++;
      
      // 従来形式でも小計行を追加
      const subtotalRow = worksheet.addRow({
        voucher_id: '',
        detail_no: '',
        account_code: '',
        account_name: '',
        sub_account_code: '',
        sub_account_name: '',
        payee: '',
        payment_date: '',
        item_details: '小計',
        amount: receipt.subtotal || receipt.amount,
        invoice_number: ''
      });
      
      subtotalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };
      
      subtotalRow.getCell('amount').numFmt = '¥#,##0';
      subtotalRow.getCell('amount').font = { bold: true };
      subtotalRow.getCell('item_details').font = { bold: true };
      subtotalRow.getCell('amount').alignment = { horizontal: 'right' };
      // ¥マークを確実に表示するため、文字列として設定
      subtotalRow.getCell('amount').value = `¥${(receipt.subtotal || receipt.amount).toLocaleString()}`;
      rowNumber++;
      
      // 消費税行を追加
      if (receipt.tax && receipt.tax > 0) {
        // 軽減税率がある場合は二行に分けて表示
        if (receipt.reduced_tax && receipt.reduced_tax > 0) {
          // 標準税率の消費税
          const standardTaxRow = worksheet.addRow({
            voucher_id: '',
            detail_no: '',
            account_code: '',
            account_name: '',
            sub_account_code: '',
            sub_account_name: '',
            payee: '',
            payment_date: '',
            item_details: '消費税（標準税率）',
            amount: receipt.tax - receipt.reduced_tax,
            invoice_number: ''
          });
          standardTaxRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          };
          standardTaxRow.getCell('amount').numFmt = '¥#,##0';
          standardTaxRow.getCell('amount').font = { bold: true };
          standardTaxRow.getCell('item_details').font = { bold: true };
          standardTaxRow.getCell('amount').alignment = { horizontal: 'right' };
          // ¥マークを確実に表示するため、文字列として設定
          standardTaxRow.getCell('amount').value = `¥${(receipt.tax - receipt.reduced_tax).toLocaleString()}`;
          rowNumber++;
          
          // 軽減税率の消費税
          const reducedTaxRow = worksheet.addRow({
            voucher_id: '',
            detail_no: '',
            account_code: '',
            account_name: '',
            sub_account_code: '',
            sub_account_name: '',
            payee: '',
            payment_date: '',
            item_details: '消費税（軽減税率）',
            amount: receipt.reduced_tax,
            invoice_number: ''
          });
          reducedTaxRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          };
          reducedTaxRow.getCell('amount').numFmt = '¥#,##0';
          reducedTaxRow.getCell('amount').font = { bold: true };
          reducedTaxRow.getCell('item_details').font = { bold: true };
          reducedTaxRow.getCell('amount').alignment = { horizontal: 'right' };
          // ¥マークを確実に表示するため、文字列として設定
          reducedTaxRow.getCell('amount').value = `¥${receipt.reduced_tax.toLocaleString()}`;
          rowNumber++;
        } else {
          // 通常の消費税
          const taxRow = worksheet.addRow({
            voucher_id: '',
            detail_no: '',
            account_code: '',
            account_name: '',
            sub_account_code: '',
            sub_account_name: '',
            payee: '',
            payment_date: '',
            item_details: '消費税',
            amount: receipt.tax,
            invoice_number: ''
          });
          taxRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6F3FF' }
          };
          taxRow.getCell('amount').numFmt = '¥#,##0';
          taxRow.getCell('amount').font = { bold: true };
          taxRow.getCell('item_details').font = { bold: true };
          taxRow.getCell('amount').alignment = { horizontal: 'right' };
          // ¥マークを確実に表示するため、文字列として設定
          taxRow.getCell('amount').value = `¥${receipt.tax.toLocaleString()}`;
          rowNumber++;
        }
      }
      
      // 合計金額（税込）行を追加
      const totalRow = worksheet.addRow({
        voucher_id: '',
        detail_no: '',
        account_code: '',
        account_name: '',
        sub_account_code: '',
        sub_account_name: '',
        payee: '',
        payment_date: '',
        item_details: '合計金額（税込）',
        amount: receipt.amount,
        invoice_number: ''
      });
      
      totalRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCE5FF' }
      };
      totalRow.getCell('amount').numFmt = '¥#,##0';
      totalRow.getCell('amount').font = { bold: true };
      totalRow.getCell('item_details').font = { bold: true };
      totalRow.getCell('amount').alignment = { horizontal: 'right' };
      // ¥マークを確実に表示するため、文字列として設定
      totalRow.getCell('amount').value = `¥${receipt.amount.toLocaleString()}`;
      rowNumber++;
    }
    
    totalAmount += receipt.amount;
  });
  
  // 全体の合計行を追加
  const totalRow = worksheet.addRow({
    voucher_id: '',
    detail_no: '',
    account_code: '',
    account_name: '',
    sub_account_code: '',
    sub_account_name: '',
    payee: '',
    payment_date: '全体合計',
    item_details: '',
    amount: totalAmount,
    invoice_number: ''
  });
  
  totalRow.getCell(8).font = { bold: true }; // payment_date列
  totalRow.getCell(10).font = { bold: true }; // amount列
  totalRow.getCell(10).numFmt = '¥#,##0';
  totalRow.getCell(10).alignment = { horizontal: 'right' };
  
  // 全体合計行の背景色を設定（濃い青色）
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFCCE5FF' }
  };
  
  return workbook;
}

// 並列処理用のセマフォクラス
class Semaphore {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.currentConcurrent = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentConcurrent < this.maxConcurrent) {
        this.currentConcurrent++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.currentConcurrent--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.currentConcurrent++;
      next();
    }
  }
}

// 並列処理用の画像処理関数
async function processImageWithSemaphore(semaphore, fileId, fileData) {
  await semaphore.acquire();
  try {
    console.log(`[並列処理] OCR開始: ${fileId} - ${fileData.originalname}`);
    const startTime = Date.now();
    
    const ocrResult = await processReceiptOCR(fileData.buffer);
    
    const processingTime = Date.now() - startTime;
    console.log(`[並列処理] OCR完了: ${fileId} (${processingTime}ms)`);
    
    return { success: true, fileId, fileName: fileData.originalname, result: ocrResult };
  } catch (error) {
    console.error(`[並列処理] OCRエラー (${fileId} - ${fileData.originalname}):`, error);
    return { 
      success: false, 
      fileId, 
      fileName: fileData.originalname, 
      error: error.message 
    };
  } finally {
    semaphore.release();
  }
}

// バッチ処理API（並列処理対応）
app.post('/api/batch-process', async (req, res) => {
  try {
    console.log('🚀 並列バッチ処理開始 - ファイル数:', fileStorage.size);
    
    if (fileStorage.size === 0) {
      return res.status(400).json({ error: 'アップロード画像がありません' });
    }
    
    // 並列処理の設定
    const MAX_CONCURRENT = 2; // レート制限を考慮して2に制限
    const semaphore = new Semaphore(MAX_CONCURRENT);
    
    console.log(`⚡ 並列処理設定: 最大同時処理数 ${MAX_CONCURRENT}`);
    
    // 全ファイルを並列処理
    const processPromises = Array.from(fileStorage.entries()).map(([fileId, fileData]) => 
      processImageWithSemaphore(semaphore, fileId, fileData)
    );
    
    console.log(`📊 処理開始: ${processPromises.length}件の画像を並列処理`);
    const startTime = Date.now();
    
    // 全処理の完了を待機
    const results = await Promise.allSettled(processPromises);
    
    const totalTime = Date.now() - startTime;
    console.log(`⏱️ 並列処理完了: ${totalTime}ms (平均: ${(totalTime / results.length).toFixed(1)}ms/件)`);
    
    // 結果を分類
    const receiptData = [];
    const errors = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { success, fileId, fileName, result: ocrResult, error } = result.value;
        if (success) {
          receiptData.push(ocrResult);
        } else {
          errors.push({ fileId, fileName, error });
        }
      } else {
        errors.push({ 
          fileId: `unknown_${index}`, 
          fileName: 'unknown', 
          error: result.reason?.message || 'Unknown error' 
        });
      }
    });
    
    console.log('📈 並列処理結果:', { 
      success: receiptData.length, 
      errors: errors.length,
      totalTime: `${totalTime}ms`,
      averageTime: `${(totalTime / results.length).toFixed(1)}ms/件`
    });
    
    if (receiptData.length === 0) {
      return res.status(500).json({ 
        error: '処理可能な領収書が見つかりませんでした',
        details: errors
      });
    }
    
    // Excelファイル生成
    console.log('📊 Excelファイル生成開始...');
    const excelStartTime = Date.now();
    const workbook = await generateExcelFile(receiptData);
    const excelTime = Date.now() - excelStartTime;
    console.log(`📊 Excelファイル生成完了: ${excelTime}ms`);
    
    const today = new Date();
    const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
    const fileName = `${dateStr}領収書一括処理_v3_並列処理.xlsx`;
    
    // メモリ内でExcelファイルを生成
    const buffer = await workbook.xlsx.writeBuffer();
    
    res.json({
      success: true,
      fileName: fileName,
      fileData: buffer.toString('base64'),
      processedCount: receiptData.length,
      totalAmount: receiptData.reduce((sum, receipt) => sum + receipt.amount, 0),
      errors: errors.length > 0 ? errors : undefined,
      performance: {
        totalTime: `${totalTime}ms`,
        averageTime: `${(totalTime / results.length).toFixed(1)}ms/件`,
        excelTime: `${excelTime}ms`,
        concurrentProcessing: MAX_CONCURRENT
      }
    });
  } catch (error) {
    console.error('バッチ処理エラー:', error);
    res.status(500).json({ error: 'バッチ処理中にエラーが発生しました: ' + error.message });
  }
});

// ExcelプレビューAPI（メモリベース対応）
app.get('/api/excel-preview', async (req, res) => {
  try {
    const file = req.query.file;
    if (!file) return res.status(400).json({ error: 'fileパラメータが必要です' });
    
    // メモリ内のExcelファイルからプレビューを生成
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(file, 'base64');
    await workbook.xlsx.load(buffer);
    
    const worksheet = workbook.worksheets[0];
    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      rows.push(row.values.slice(1)); // 0番目は空
    });
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: 'Excelプレビュー取得エラー', detail: err.message });
  }
});

// ファイル削除API（Vercel対応）
app.post('/api/delete-file', express.json(), (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'ファイルIDが指定されていません' });
  
  if (!fileStorage.has(id)) {
    return res.status(404).json({ error: 'ファイルが見つかりません' });
  }
  
  fileStorage.delete(id);
  res.json({ success: true });
});

// 全クリアAPI（Vercel対応）
app.post('/api/clear-files', (req, res) => {
  fileStorage.clear();
  res.json({ success: true });
});

// LLMプロバイダー切り替えAPI
app.post('/api/switch-llm', async (req, res) => {
  try {
    const { provider } = req.body;
    
    if (!provider) {
      return res.status(400).json({ error: 'プロバイダー名が必要です' });
    }
    
    // 新しいLLMサービスを作成
    const newLLMService = LLMFactory.createLLM(provider);
    
    // ヘルスチェック
    const isHealthy = await newLLMService.healthCheck();
    if (!isHealthy) {
      return res.status(400).json({ 
        error: `${provider}サービスが利用できません`,
        provider: provider
      });
    }
    
    // サービスを切り替え
    llmService = newLLMService;
    
    console.log(`[LLM] プロバイダー切り替え完了: ${llmService.getProviderName()} (${llmService.getModelName()})`);
    
    res.json({
      success: true,
      provider: llmService.getProviderName(),
      model: llmService.getModelName(),
      capabilities: llmService.getCapabilities()
    });
  } catch (error) {
    console.error('[LLM] プロバイダー切り替えエラー:', error);
    res.status(500).json({ 
      error: 'プロバイダー切り替えに失敗しました: ' + error.message 
    });
  }
});

// ダウンロード用
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// グローバルエラーハンドラー
app.use((err, req, res, next) => {
  console.error('サーバーエラー:', err);
  res.status(500).json({ 
    error: 'サーバー内部エラーが発生しました',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
  });
});

// 404ハンドラー
app.use((req, res) => {
  res.status(404).json({ error: 'エンドポイントが見つかりません' });
});

// Vercel用のエクスポート
module.exports = app;

// ローカル開発時のみサーバー起動
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    console.log(`環境: ${process.env.NODE_ENV || 'development'}`);
  });
} 