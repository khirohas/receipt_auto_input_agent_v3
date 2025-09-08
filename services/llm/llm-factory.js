/**
 * LLM Factory - ファクトリーパターン実装
 * 
 * 指定されたプロバイダーに基づいて適切なLLMサービスインスタンスを作成します。
 * 設定の検証、フォールバック処理、エラーハンドリングを統合的に管理します。
 * 
 * @author Receipt Auto Input Agent v3
 * @version 3.0.0
 */

const OpenAIService = require('./openai-service');
const GeminiService = require('./gemini-service');
const { 
  getProviderConfig, 
  getAvailableProviders, 
  getFallbackProvider,
  isCurrentProviderAvailable 
} = require('../../config/llm-config');

class LLMFactory {
  /**
   * 利用可能なLLMサービスクラスのマッピング
   */
  static SERVICE_CLASSES = {
    'openai': OpenAIService,
    'gemini': GeminiService
  };

  /**
   * 指定されたプロバイダーのLLMサービスインスタンスを作成
   * @param {string} provider - プロバイダー名
   * @param {Object} config - カスタム設定（省略時は環境変数から取得）
   * @returns {BaseLLM} LLMサービスインスタンス
   * @throws {Error} プロバイダーが無効または設定が不正な場合
   */
  static createLLM(provider, config = null) {
    try {
      // プロバイダーの検証
      if (!provider || typeof provider !== 'string') {
        throw new Error('Provider name is required and must be a string');
      }

      const normalizedProvider = provider.toLowerCase();
      
      if (!this.SERVICE_CLASSES[normalizedProvider]) {
        const availableProviders = Object.keys(this.SERVICE_CLASSES).join(', ');
        throw new Error(`Unsupported provider: ${provider}. Available providers: ${availableProviders}`);
      }

      // 設定の取得と検証
      const serviceConfig = config || getProviderConfig(normalizedProvider);
      
      // サービスインスタンスの作成
      const ServiceClass = this.SERVICE_CLASSES[normalizedProvider];
      const service = new ServiceClass(serviceConfig);
      
      console.log(`[LLMFactory] Created ${service.getProviderName()} service with model: ${service.getModelName()}`);
      
      return service;
    } catch (error) {
      console.error(`[LLMFactory] Failed to create LLM service for provider: ${provider}`, error);
      throw error;
    }
  }

  /**
   * デフォルトプロバイダーでLLMサービスインスタンスを作成
   * @param {Object} config - カスタム設定（省略時は環境変数から取得）
   * @returns {BaseLLM} LLMサービスインスタンス
   */
  static createDefaultLLM(config = null) {
    const { LLM_CONFIG } = require('../../config/llm-config');
    return this.createLLM(LLM_CONFIG.provider, config);
  }

  /**
   * フォールバック付きでLLMサービスインスタンスを作成
   * プライマリプロバイダーが利用できない場合、利用可能なプロバイダーに自動切り替え
   * @param {string} primaryProvider - プライマリプロバイダー名
   * @param {Object} config - カスタム設定（省略時は環境変数から取得）
   * @returns {BaseLLM} LLMサービスインスタンス
   */
  static createLLMWithFallback(primaryProvider, config = null) {
    try {
      // プライマリプロバイダーで作成を試行
      return this.createLLM(primaryProvider, config);
    } catch (error) {
      console.warn(`[LLMFactory] Primary provider ${primaryProvider} failed, trying fallback`, error.message);
      
      // フォールバックプロバイダーを取得
      const fallbackProvider = getFallbackProvider();
      
      if (!fallbackProvider) {
        throw new Error(`No available LLM providers. Primary: ${primaryProvider}, Error: ${error.message}`);
      }
      
      console.log(`[LLMFactory] Using fallback provider: ${fallbackProvider}`);
      return this.createLLM(fallbackProvider, config);
    }
  }

  /**
   * 利用可能な全てのプロバイダーでLLMサービスインスタンスを作成
   * @param {Object} config - カスタム設定（省略時は環境変数から取得）
   * @returns {Object} プロバイダー名をキーとしたLLMサービスインスタンスのマップ
   */
  static createAllAvailableLLMs(config = null) {
    const services = {};
    const availableProviders = getAvailableProviders();
    
    for (const provider of availableProviders) {
      try {
        services[provider] = this.createLLM(provider, config);
        console.log(`[LLMFactory] Successfully created ${provider} service`);
      } catch (error) {
        console.warn(`[LLMFactory] Failed to create ${provider} service:`, error.message);
      }
    }
    
    return services;
  }

  /**
   * プロバイダーの利用可能性をチェック
   * @param {string} provider - プロバイダー名
   * @returns {boolean} 利用可能かどうか
   */
  static isProviderAvailable(provider) {
    try {
      this.createLLM(provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 利用可能なプロバイダーリストを取得
   * @returns {Array<string>} 利用可能なプロバイダー名の配列
   */
  static getAvailableProviders() {
    return getAvailableProviders().filter(provider => 
      this.isProviderAvailable(provider)
    );
  }

  /**
   * プロバイダー情報を取得
   * @param {string} provider - プロバイダー名
   * @returns {Object} プロバイダー情報
   */
  static getProviderInfo(provider) {
    try {
      const service = this.createLLM(provider);
      return {
        provider: service.getProviderName(),
        model: service.getModelName(),
        capabilities: service.getCapabilities(),
        available: true
      };
    } catch (error) {
      return {
        provider: provider,
        model: null,
        capabilities: null,
        available: false,
        error: error.message
      };
    }
  }

  /**
   * 全プロバイダーの情報を取得
   * @returns {Object} 全プロバイダーの情報
   */
  static getAllProviderInfo() {
    const info = {};
    const allProviders = Object.keys(this.SERVICE_CLASSES);
    
    for (const provider of allProviders) {
      info[provider] = this.getProviderInfo(provider);
    }
    
    return info;
  }

  /**
   * ヘルスチェックを実行
   * @param {string} provider - プロバイダー名（省略時は全プロバイダー）
   * @returns {Promise<Object>} ヘルスチェック結果
   */
  static async healthCheck(provider = null) {
    if (provider) {
      try {
        const service = this.createLLM(provider);
        const isHealthy = await service.healthCheck();
        return {
          provider: service.getProviderName(),
          healthy: isHealthy,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return {
          provider: provider,
          healthy: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    } else {
      // 全プロバイダーのヘルスチェック
      const results = {};
      const availableProviders = this.getAvailableProviders();
      
      for (const provider of availableProviders) {
        results[provider] = await this.healthCheck(provider);
      }
      
      return results;
    }
  }
}

module.exports = LLMFactory;
