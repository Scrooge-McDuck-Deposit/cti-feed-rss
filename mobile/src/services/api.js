/**
 * Servizio API per comunicare con il backend CTI Feed RSS.
 */

const API_BASE_URL = 'http://localhost:8000/api/v1';

class ApiService {
  constructor() {
    this.baseUrl = API_BASE_URL;
    this.timeout = 30000;
  }

  setBaseUrl(url) {
    this.baseUrl = url;
  }

  async _fetch(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Timeout della richiesta');
      }
      throw error;
    }
  }

  // ── Feed ────────────────────────────────────────────────────────────────

  async getFeeds(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._fetch(`/feeds${query ? '?' + query : ''}`);
  }

  async getFeed(feedId) {
    return this._fetch(`/feeds/${feedId}`);
  }

  // ── Articles ────────────────────────────────────────────────────────────

  async fetchArticles(feedId = null) {
    const query = feedId ? `?feed_id=${feedId}` : '';
    return this._fetch(`/articles/fetch${query}`, { method: 'POST' });
  }

  async getArticles(params = {}) {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null))
    ).toString();
    return this._fetch(`/articles${query ? '?' + query : ''}`);
  }

  async getArticle(articleId) {
    return this._fetch(`/articles/${articleId}`);
  }

  async analyzeArticle(articleId) {
    return this._fetch(`/articles/${articleId}/analyze`, { method: 'POST' });
  }

  async analyzeAllPending() {
    return this._fetch('/articles/analyze-all', { method: 'POST' });
  }

  // ── STIX ────────────────────────────────────────────────────────────────

  async getArticleStix(articleId) {
    return this._fetch(`/articles/${articleId}/stix`);
  }

  // ── Reports ─────────────────────────────────────────────────────────────

  async generateReport(articleIds, title = null, language = 'it') {
    return this._fetch('/reports/generate', {
      method: 'POST',
      body: JSON.stringify({
        article_ids: articleIds,
        title,
        include_stix: true,
        language,
      }),
    });
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  async getDashboardStats() {
    return this._fetch('/dashboard/stats');
  }

  // ── Categories ──────────────────────────────────────────────────────────

  async getCategories() {
    return this._fetch('/categories');
  }

  // ── Cache ───────────────────────────────────────────────────────────────

  async getCacheStats() {
    return this._fetch('/cache/stats');
  }

  async cleanupCache() {
    return this._fetch('/cache/cleanup', { method: 'POST' });
  }

  async clearCache() {
    return this._fetch('/cache', { method: 'DELETE' });
  }

  // ── AI Status ──────────────────────────────────────────────────────

  async getAiStatus() {
    return this._fetch('/ai/status');
  }

  // ── OPML Import ────────────────────────────────────────────────────

  async importOpml(opmlUrl) {
    return this._fetch(`/feeds/import-opml?url=${encodeURIComponent(opmlUrl)}`, {
      method: 'POST',
    });
  }
}

export const apiService = new ApiService();
export default apiService;
