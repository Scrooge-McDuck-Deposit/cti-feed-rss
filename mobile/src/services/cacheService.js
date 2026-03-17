/**
 * Servizio di cache locale per l'app CTI Feed RSS.
 * Utilizza AsyncStorage per memorizzare articoli e dati offline.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEYS = {
  ARTICLES: '@cti_articles',
  FEEDS: '@cti_feeds',
  STATS: '@cti_stats',
  CATEGORIES: '@cti_categories',
  REPORTS: '@cti_reports',
  SETTINGS: '@cti_settings',
  LAST_SYNC: '@cti_last_sync',
};

const DEFAULT_TTL = 6 * 60 * 60 * 1000; // 6 ore in millisecondi

class CacheService {
  /**
   * Salva dati in cache con timestamp.
   */
  async set(key, data, ttl = DEFAULT_TTL) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        ttl,
      };
      await AsyncStorage.setItem(key, JSON.stringify(cacheEntry));
    } catch (error) {
      console.error('Cache write error:', error);
    }
  }

  /**
   * Recupera dati dalla cache. Restituisce null se scaduti o assenti.
   */
  async get(key) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;

      const entry = JSON.parse(raw);
      const isExpired = Date.now() - entry.timestamp > entry.ttl;

      if (isExpired) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  /**
   * Recupera dati dalla cache senza controllo scadenza (per offline).
   */
  async getForced(key) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      return entry.data;
    } catch (error) {
      console.error('Cache forced read error:', error);
      return null;
    }
  }

  /**
   * Rimuove un elemento dalla cache.
   */
  async remove(key) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Cache remove error:', error);
    }
  }

  // ── Articoli ──────────────────────────────────────────────────────────

  async cacheArticles(articles) {
    await this.set(CACHE_KEYS.ARTICLES, articles);
  }

  async getCachedArticles() {
    return await this.get(CACHE_KEYS.ARTICLES);
  }

  async getCachedArticlesOffline() {
    return await this.getForced(CACHE_KEYS.ARTICLES);
  }

  async cacheArticleDetail(articleId, article) {
    await this.set(`${CACHE_KEYS.ARTICLES}_${articleId}`, article);
  }

  async getCachedArticleDetail(articleId) {
    return await this.get(`${CACHE_KEYS.ARTICLES}_${articleId}`);
  }

  async getCachedArticleDetailOffline(articleId) {
    return await this.getForced(`${CACHE_KEYS.ARTICLES}_${articleId}`);
  }

  // ── Feed ──────────────────────────────────────────────────────────────

  async cacheFeeds(feeds) {
    await this.set(CACHE_KEYS.FEEDS, feeds, 24 * 60 * 60 * 1000); // 24h
  }

  async getCachedFeeds() {
    return await this.get(CACHE_KEYS.FEEDS);
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async cacheStats(stats) {
    await this.set(CACHE_KEYS.STATS, stats, 30 * 60 * 1000); // 30min
  }

  async getCachedStats() {
    return await this.get(CACHE_KEYS.STATS);
  }

  async getCachedStatsOffline() {
    return await this.getForced(CACHE_KEYS.STATS);
  }

  // ── Report ────────────────────────────────────────────────────────────

  async cacheReport(reportId, report) {
    await this.set(`${CACHE_KEYS.REPORTS}_${reportId}`, report);
  }

  async getCachedReport(reportId) {
    return await this.get(`${CACHE_KEYS.REPORTS}_${reportId}`);
  }

  // ── Sync Info ─────────────────────────────────────────────────────────

  async setLastSync() {
    await AsyncStorage.setItem(CACHE_KEYS.LAST_SYNC, Date.now().toString());
  }

  async getLastSync() {
    try {
      const ts = await AsyncStorage.getItem(CACHE_KEYS.LAST_SYNC);
      return ts ? parseInt(ts, 10) : null;
    } catch {
      return null;
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────

  async saveSettings(settings) {
    await AsyncStorage.setItem(CACHE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  async getSettings() {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEYS.SETTINGS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  async getCacheSize() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const ctiKeys = keys.filter((k) => k.startsWith('@cti_'));
      let totalSize = 0;

      for (const key of ctiKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length * 2; // Approssimazione UTF-16
        }
      }

      return {
        items: ctiKeys.length,
        sizeBytes: totalSize,
        sizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      };
    } catch {
      return { items: 0, sizeBytes: 0, sizeMB: '0' };
    }
  }

  async clearAll() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const ctiKeys = keys.filter((k) => k.startsWith('@cti_'));
      await AsyncStorage.multiRemove(ctiKeys);
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}

export const cacheService = new CacheService();
export { CACHE_KEYS };
export default cacheService;
