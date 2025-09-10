/**
 * LLM設定管理モジュール
 * 
 * マルチLLM対応のための設定を一元管理します。
 * 環境変数から設定を読み込み、各LLMプロバイダーの設定を提供します。
 * 
 * @author Receipt Auto Input Agent v3
 * @version 3.0.0
 */

/**
 * LLM設定オブジェクト
 * 環境変数から設定を読み込み、デフォルト値を設定
 */
const LLM_CONFIG = {
  // デフォルトプロバイダー（環境変数で指定、デフォルトはOpenAI）
  provider: process.env.LLM_PROVIDER || 'openai',
  
  // OpenAI設定
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1500,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.1,
    timeout: parseInt(process.env.OPENAI_TIMEOUT) || 30000
  },
  
  // Google Gemini設定
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 1500,
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.1,
    timeout: parseInt(process.env.GEMINI_TIMEOUT) || 30000
  },
  
  // 共通設定
  common: {
    retryAttempts: parseInt(process.env.LLM_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.LLM_RETRY_DELAY) || 1000,
    enableLogging: process.env.LLM_ENABLE_LOGGING !== 'false',
    enableHealthCheck: process.env.LLM_ENABLE_HEALTH_CHECK !== 'false'
  }
};

/**
 * 設定の検証
 * @param {string} provider - プロバイダー名
 * @returns {boolean} 設定が有効かどうか
 */
function validateConfig(provider = LLM_CONFIG.provider) {
  const config = LLM_CONFIG[provider];
  
  if (!config) {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }
  
  if (!config.apiKey) {
    throw new Error(`${provider.toUpperCase()}_API_KEY environment variable is required`);
  }
  
  return true;
}

/**
 * プロバイダー設定を取得
 * @param {string} provider - プロバイダー名（省略時はデフォルトプロバイダー）
 * @returns {Object} プロバイダー設定
 */
function getProviderConfig(provider = LLM_CONFIG.provider) {
  validateConfig(provider);
  return LLM_CONFIG[provider];
}

/**
 * 利用可能なプロバイダーリストを取得
 * @returns {Array<string>} プロバイダー名の配列
 */
function getAvailableProviders() {
  return Object.keys(LLM_CONFIG).filter(key => 
    key !== 'provider' && key !== 'common'
  );
}

/**
 * 現在のプロバイダーが利用可能かチェック
 * @returns {boolean} 利用可能かどうか
 */
function isCurrentProviderAvailable() {
  try {
    validateConfig();
    return true;
  } catch (error) {
    console.warn('Current provider not available:', error.message);
    return false;
  }
}

/**
 * フォールバックプロバイダーを取得
 * @returns {string|null} 利用可能なフォールバックプロバイダー
 */
function getFallbackProvider() {
  const availableProviders = getAvailableProviders();
  
  for (const provider of availableProviders) {
    try {
      validateConfig(provider);
      return provider;
    } catch (error) {
      continue;
    }
  }
  
  return null;
}

/**
 * 設定情報を取得（デバッグ用）
 * @returns {Object} 設定情報（APIキーはマスク）
 */
function getConfigInfo() {
  const info = {
    currentProvider: LLM_CONFIG.provider,
    availableProviders: getAvailableProviders(),
    configs: {}
  };
  
  // 各プロバイダーの設定情報をマスクして取得
  for (const provider of info.availableProviders) {
    const config = LLM_CONFIG[provider];
    info.configs[provider] = {
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      timeout: config.timeout,
      hasApiKey: !!config.apiKey
    };
  }
  
  return info;
}

module.exports = {
  LLM_CONFIG,
  validateConfig,
  getProviderConfig,
  getAvailableProviders,
  isCurrentProviderAvailable,
  getFallbackProvider,
  getConfigInfo
};

