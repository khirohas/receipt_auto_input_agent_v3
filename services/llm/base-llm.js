/**
 * BaseLLM - マルチLLM対応の抽象基底クラス
 * 
 * このクラスは全てのLLMプロバイダーが実装すべき共通インターフェースを定義します。
 * Strategy PatternとFactory Patternを組み合わせて、LLMプロバイダーの切り替えを
 * 容易にし、コードの保守性と拡張性を向上させます。
 * 
 * @abstract
 * @author Receipt Auto Input Agent v3
 * @version 3.0.0
 */

class BaseLLM {
  /**
   * コンストラクタ
   * @param {Object} config - LLM設定オブジェクト
   */
  constructor(config = {}) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * 設定の検証（サブクラスでオーバーライド）
   * @abstract
   * @throws {Error} 設定が無効な場合
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * 画像から領収書情報を抽出する
   * @abstract
   * @param {Buffer} imageBuffer - 画像データのバッファ
   * @param {string} prompt - プロンプト文字列
   * @returns {Promise<Object>} 抽出された領収書情報
   * @throws {Error} 処理に失敗した場合
   */
  async processImage(imageBuffer, prompt) {
    throw new Error('processImage() must be implemented by subclass');
  }

  /**
   * テキスト処理（将来の拡張用）
   * @abstract
   * @param {string} prompt - プロンプト文字列
   * @returns {Promise<Object>} 処理結果
   * @throws {Error} 処理に失敗した場合
   */
  async processText(prompt) {
    throw new Error('processText() must be implemented by subclass');
  }

  /**
   * プロバイダー名を取得
   * @abstract
   * @returns {string} プロバイダー名
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented by subclass');
  }

  /**
   * モデル名を取得
   * @abstract
   * @returns {string} モデル名
   */
  getModelName() {
    throw new Error('getModelName() must be implemented by subclass');
  }

  /**
   * 利用可能な機能を取得
   * @returns {Object} 機能フラグ
   */
  getCapabilities() {
    return {
      imageProcessing: true,
      textProcessing: true,
      batchProcessing: false,
      streaming: false
    };
  }

  /**
   * ヘルスチェック
   * @returns {Promise<boolean>} サービスが利用可能かどうか
   */
  async healthCheck() {
    try {
      // 基本的なヘルスチェック（サブクラスでオーバーライド可能）
      return this.config && Object.keys(this.config).length > 0;
    } catch (error) {
      console.error(`${this.getProviderName()} health check failed:`, error);
      return false;
    }
  }

  /**
   * エラーハンドリングの共通処理
   * @param {Error} error - 発生したエラー
   * @param {string} operation - 実行していた操作
   * @returns {Error} 処理済みエラー
   */
  handleError(error, operation = 'unknown') {
    const providerName = this.getProviderName();
    const modelName = this.getModelName();
    
    console.error(`[${providerName}:${modelName}] ${operation} failed:`, error);
    
    // エラーメッセージの正規化
    if (error.message.includes('API key') || error.message.includes('authentication')) {
      return new Error(`${providerName}のAPIキーが無効または設定されていません`);
    }
    
    if (error.message.includes('quota') || error.message.includes('rate limit')) {
      return new Error(`${providerName}の利用制限に達しました。しばらく待ってから再試行してください`);
    }
    
    if (error.message.includes('network') || error.message.includes('timeout')) {
      return new Error(`${providerName}への接続に失敗しました。ネットワーク接続を確認してください`);
    }
    
    // デフォルトエラー
    return new Error(`${providerName}での${operation}処理中にエラーが発生しました: ${error.message}`);
  }

  /**
   * レスポンスの正規化
   * @param {Object} rawResponse - 生のAPIレスポンス
   * @returns {Object} 正規化されたレスポンス
   */
  normalizeResponse(rawResponse) {
    // サブクラスでオーバーライドして、各プロバイダーのレスポンス形式を統一
    return rawResponse;
  }

  /**
   * ログ出力の共通処理
   * @param {string} level - ログレベル (info, warn, error)
   * @param {string} message - ログメッセージ
   * @param {Object} data - 追加データ
   */
  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const providerName = this.getProviderName();
    const modelName = this.getModelName();
    
    const logMessage = `[${timestamp}] [${providerName}:${modelName}] ${message}`;
    
    switch (level) {
      case 'error':
        console.error(logMessage, data);
        break;
      case 'warn':
        console.warn(logMessage, data);
        break;
      case 'info':
      default:
        console.log(logMessage, data);
        break;
    }
  }
}

module.exports = BaseLLM;
