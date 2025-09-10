/**
 * OpenAI Service - OpenAI API実装
 * 
 * BaseLLMを継承してOpenAI APIの具体的な実装を提供します。
 * 既存のprocessReceiptOCR関数のロジックを移植し、
 * マルチLLM対応アーキテクチャに統合します。
 * 
 * @author Receipt Auto Input Agent v3
 * @version 3.0.0
 */

const BaseLLM = require('./base-llm');
const OpenAI = require('openai');
const { getProviderConfig } = require('../../config/llm-config');

class OpenAIService extends BaseLLM {
  /**
   * コンストラクタ
   * @param {Object} config - OpenAI設定（省略時は環境変数から取得）
   */
  constructor(config = null) {
    const openaiConfig = config || getProviderConfig('openai');
    super(openaiConfig);
    
    this.client = new OpenAI({
      apiKey: this.config.apiKey
    });
    
    this.log('info', 'OpenAI service initialized', {
      model: this.config.model,
      maxTokens: this.config.maxTokens
    });
  }

  /**
   * 設定の検証
   * @override
   */
  validateConfig() {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    
    if (!this.config.model) {
      throw new Error('OpenAI model is required');
    }
  }

  /**
   * プロバイダー名を取得
   * @override
   * @returns {string} プロバイダー名
   */
  getProviderName() {
    return 'OpenAI';
  }

  /**
   * モデル名を取得
   * @override
   * @returns {string} モデル名
   */
  getModelName() {
    return this.config.model;
  }

  /**
   * 画像から領収書情報を抽出する
   * @override
   * @param {Buffer} imageBuffer - 画像データのバッファ
   * @param {string} prompt - プロンプト文字列
   * @returns {Promise<Object>} 抽出された領収書情報
   */
  async processImage(imageBuffer, prompt) {
    try {
      this.log('info', 'Starting image processing', {
        imageSize: imageBuffer.length,
        model: this.config.model
      });

      const base64Image = imageBuffer.toString('base64');
      
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "この領収書画像から必要な情報を抽出してください。品目名は具体的に記載し、会計科目判定の指針に従って適切な品目カテゴリを選択してください。"
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
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      const content = response.choices[0].message.content.trim();
      
      this.log('info', 'OpenAI response received', {
        responseLength: content.length,
        usage: response.usage
      });

      return this.normalizeResponse(content);
    } catch (error) {
      this.log('error', 'Image processing failed', { error: error.message });
      throw this.handleError(error, 'image processing');
    }
  }

  /**
   * テキスト処理（将来の拡張用）
   * @override
   * @param {string} prompt - プロンプト文字列
   * @returns {Promise<Object>} 処理結果
   */
  async processText(prompt) {
    try {
      this.log('info', 'Starting text processing', {
        promptLength: prompt.length,
        model: this.config.model
      });

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      const content = response.choices[0].message.content.trim();
      
      this.log('info', 'Text processing completed', {
        responseLength: content.length,
        usage: response.usage
      });

      return this.normalizeResponse(content);
    } catch (error) {
      this.log('error', 'Text processing failed', { error: error.message });
      throw this.handleError(error, 'text processing');
    }
  }

  /**
   * レスポンスの正規化
   * @override
   * @param {string} rawResponse - 生のAPIレスポンス
   * @returns {Object} 正規化されたレスポンス
   */
  normalizeResponse(rawResponse) {
    try {
      let content = rawResponse.trim();
      
      // コードブロックを除去
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '');
      }
      if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '');
      }
      if (content.endsWith('```')) {
        content = content.replace(/\s*```$/, '');
      }
      
      this.log('info', 'Normalizing response', {
        originalLength: rawResponse.length,
        cleanedLength: content.length
      });
      
      // JSONパース前に内容をチェック
      this.log('debug', 'Response content preview', {
        preview: content.substring(0, 200) + '...'
      });
      
      try {
        const parsedResponse = JSON.parse(content);
        this.log('info', 'Response parsed successfully');
        return parsedResponse;
      } catch (parseError) {
        this.log('error', 'JSON parse error', {
          parseError: parseError.message,
          content: content.substring(0, 500)
        });
        
        // エラーメッセージが含まれている場合の処理
        if (content.includes('申し訳ありませんが') || content.includes('申し訳ございません')) {
          throw new Error('画像が不鮮明または読み取れませんでした。より鮮明な画像をアップロードしてください。');
        }
        
        // その他のエラーメッセージ
        if (content.includes('エラー') || content.includes('error')) {
          throw new Error('画像処理中にエラーが発生しました: ' + content.substring(0, 100));
        }
        
        throw new Error('画像から情報を抽出できませんでした。領収書が鮮明に写っているか確認してください。');
      }
    } catch (error) {
      this.log('error', 'Response normalization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * ヘルスチェック
   * @override
   * @returns {Promise<boolean>} サービスが利用可能かどうか
   */
  async healthCheck() {
    try {
      // 簡単なAPI呼び出しでヘルスチェック
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 10
      });
      
      this.log('info', 'Health check passed');
      return response && response.choices && response.choices.length > 0;
    } catch (error) {
      this.log('error', 'Health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * 利用可能な機能を取得
   * @override
   * @returns {Object} 機能フラグ
   */
  getCapabilities() {
    return {
      imageProcessing: true,
      textProcessing: true,
      batchProcessing: true,
      streaming: false,
      vision: true,
      jsonMode: false // GPT-4oはJSONモードをサポートしていない
    };
  }
}

module.exports = OpenAIService;

