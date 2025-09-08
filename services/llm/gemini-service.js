/**
 * Gemini Service - Google Gemini API実装
 * 
 * BaseLLMを継承してGoogle Gemini APIの具体的な実装を提供します。
 * マルチモーダル対応のGemini APIを使用して領収書画像の処理を行います。
 * 
 * @author Receipt Auto Input Agent v3
 * @version 3.0.0
 */

const BaseLLM = require('./base-llm');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getProviderConfig } = require('../../config/llm-config');

class GeminiService extends BaseLLM {
  /**
   * コンストラクタ
   * @param {Object} config - Gemini設定（省略時は環境変数から取得）
   */
  constructor(config = null) {
    const geminiConfig = config || getProviderConfig('gemini');
    super(geminiConfig);
    
    this.client = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.client.getGenerativeModel({ 
      model: this.config.model,
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature
      }
    });
    
    this.log('info', 'Gemini service initialized', {
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
      throw new Error('Gemini API key is required');
    }
    
    if (!this.config.model) {
      throw new Error('Gemini model is required');
    }
  }

  /**
   * プロバイダー名を取得
   * @override
   * @returns {string} プロバイダー名
   */
  getProviderName() {
    return 'Gemini';
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

      // Gemini API用の画像データを準備
      const imageData = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: 'image/jpeg'
        }
      };

      const fullPrompt = `${prompt}

この領収書画像から必要な情報を抽出してください。品目名は具体的に記載し、会計科目判定の指針に従って適切な品目カテゴリを選択してください。`;

      const result = await this.model.generateContent([
        fullPrompt,
        imageData
      ]);

      const response = await result.response;
      const content = response.text();
      
      this.log('info', 'Gemini response received', {
        responseLength: content.length,
        finishReason: response.candidates?.[0]?.finishReason
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

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();
      
      this.log('info', 'Text processing completed', {
        responseLength: content.length,
        finishReason: response.candidates?.[0]?.finishReason
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
      const result = await this.model.generateContent("Hello");
      const response = await result.response;
      
      this.log('info', 'Health check passed');
      return response && response.text();
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
      jsonMode: false // GeminiはJSONモードをサポートしていない
    };
  }

  /**
   * Gemini固有のエラーハンドリング
   * @override
   * @param {Error} error - 発生したエラー
   * @param {string} operation - 実行していた操作
   * @returns {Error} 処理済みエラー
   */
  handleError(error, operation = 'unknown') {
    // 親クラスのエラーハンドリングを実行
    const baseError = super.handleError(error, operation);
    
    // Gemini固有のエラーハンドリング
    if (error.message.includes('SAFETY')) {
      return new Error('Geminiの安全性フィルターにより処理がブロックされました。別の画像を試してください。');
    }
    
    if (error.message.includes('QUOTA_EXCEEDED')) {
      return new Error('Geminiの利用制限に達しました。しばらく待ってから再試行してください。');
    }
    
    if (error.message.includes('PERMISSION_DENIED')) {
      return new Error('Gemini APIへのアクセス権限がありません。APIキーを確認してください。');
    }
    
    return baseError;
  }
}

module.exports = GeminiService;
