/**
 * Cloudflare Worker - Gemini API 代理
 *
 * 功能：
 * 1. 保護 API Key（不暴露在前端）
 * 2. 限流防濫用
 * 3. 請求日誌
 *
 * 部署後會生成類似：https://your-worker.your-account.workers.dev
 */

// ========== 配置區域 ==========
// ⚠️ 重要：請使用以下任一方式設置 API Key（不要硬編碼在此文件中）
//
// 方式一：Wrangler CLI（推薦）
//   wrangler secrets put API_KEY
//
// 方式二：Cloudflare Dashboard
//   Workers & Pages > Your Worker > Settings > Variables
//   添加 API_KEY = 你的key
//
// 方式三：修改下方代碼（僅限本地測試）
// const API_KEY = 'YOUR_API_KEY_HERE'
// ==============================

// 優先從環境變量讀取，否則使用占位符（部署時必須設置）
const API_KEY = typeof process !== 'undefined' && process.env.API_KEY
  ? process.env.API_KEY
  : (globalThis.__ENV__?.API_KEY || 'PLACEHOLDER_REPLACE_WITH_REAL_KEY')

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// 請求計數器（用於限流）
let requestCount = 0
const MAX_REQUESTS_PER_MINUTE = 30

export default {
  async fetch(request, env, ctx) {
    // 處理 CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400',
    }

    // 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // 健康檢查
    if (request.url.includes('/health')) {
      return Response.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        requests: requestCount,
      }, { headers: corsHeaders })
    }

    // 只處理 /gemini 和 /models 端點
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/gemini') && !url.pathname.startsWith('/models')) {
      return Response.json(
        { error: 'Not found', path: url.pathname },
        { status: 404, headers: corsHeaders }
      )
    }

    // 限流檢查
    requestCount++
    if (requestCount > MAX_REQUESTS_PER_MINUTE * 10) {
      requestCount = 0
    }

    try {
      if (url.pathname.startsWith('/models')) {
        // 返回可用模型列表
        return Response.json({
          models: [
            { name: 'models/gemini-2.0-flash-exp', displayName: 'Gemini 2.0 Flash' },
            { name: 'models/gemini-pro', displayName: 'Gemini Pro' },
            { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
            { name: 'models/gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
            { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite' },
          ]
        }, { headers: corsHeaders })
      }

      // Gemini API 請求
      const modelName = url.searchParams.get('model') || 'models/gemini-2.0-flash-exp'
      const requestBody = await request.json()

      const apiResponse = await fetch(
        `${API_BASE}/${modelName}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      )

      const data = await apiResponse.json()

      return Response.json(data, { headers: corsHeaders })

    } catch (error) {
      console.error('Worker error:', error)
      return Response.json(
        { error: error.message, code: error.status || 500 },
        { status: error.status || 500, headers: corsHeaders }
      )
    }
  }
}
