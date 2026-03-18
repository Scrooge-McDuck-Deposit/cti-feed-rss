/**
 * Store globale dell'applicazione (Zustand).
 * Gestisce lo stato di articoli, feed, filtri e connettività.
 */

import { create } from 'zustand';
import apiService from '../services/api';
import cacheService from '../services/cacheService';

// Request deduplication tracker
let _loadArticlesInFlight = null;

const useStore = create((set, get) => ({
  // ── State ─────────────────────────────────────────────────────────────

  // Articoli
  articles: [],
  totalArticles: 0,
  currentPage: 1,
  hasMore: false,
  selectedArticle: null,

  // Feed
  feeds: [],

  // Filtri
  filters: {
    category: null,
    severity: null,
    feedId: null,
    search: '',
  },

  // Categorie
  categories: [],

  // Dashboard
  stats: null,

  // Report
  reports: [],

  // UI State
  isLoading: false,
  isRefreshing: false,
  isOffline: false,
  error: null,
  lastSync: null,

  // Settings
  settings: {
    apiUrl: 'http://localhost:8000/api/v1',
    autoAnalyze: false,
    language: 'it',
    notificationsEnabled: false,
  },

  // AI Status
  aiStatus: null,
  aiConfig: null,

  // ── Actions ───────────────────────────────────────────────────────────

  setLoading: (loading) => set({ isLoading: loading }),
  setRefreshing: (refreshing) => set({ isRefreshing: refreshing }),
  setOffline: (offline) => set({ isOffline: offline }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),

  // ── Feed Actions ──────────────────────────────────────────────────────

  loadFeeds: async () => {
    try {
      // Prova dalla cache
      const cached = await cacheService.getCachedFeeds();
      if (cached) {
        set({ feeds: cached });
      }

      // Aggiorna dal server
      const feeds = await apiService.getFeeds();
      set({ feeds });
      await cacheService.cacheFeeds(feeds);
    } catch (error) {
      console.error('Error loading feeds:', error);
      // Usa cache offline
      const cached = await cacheService.getForced('@cti_feeds');
      if (cached) set({ feeds: cached });
    }
  },

  // ── Article Actions ───────────────────────────────────────────────────

  loadArticles: async (page = 1, append = false) => {
    const { filters } = get();

    // Deduplication: if same request is in flight, skip
    const requestKey = JSON.stringify({ page, append, filters });
    if (_loadArticlesInFlight === requestKey) return;
    _loadArticlesInFlight = requestKey;

    set({ isLoading: !append, error: null });

    try {
      const params = {
        page: page.toString(),
        page_size: '20',
      };
      if (filters.category) params.category = filters.category;
      if (filters.severity) params.severity = filters.severity;
      if (filters.feedId) params.feed_id = filters.feedId;
      if (filters.search) params.search = filters.search;

      const result = await apiService.getArticles(params);

      set({
        articles: append ? [...get().articles, ...result.articles] : result.articles,
        totalArticles: result.total,
        currentPage: result.page,
        hasMore: result.has_next,
        isLoading: false,
      });

      // Salva in cache
      if (!append) {
        await cacheService.cacheArticles(result.articles);
      }
    } catch (error) {
      console.error('Error loading articles:', error);

      // Modalità offline: carica dalla cache
      if (!append) {
        const cached = await cacheService.getCachedArticlesOffline();
        if (cached) {
          set({
            articles: cached,
            totalArticles: cached.length,
            isLoading: false,
            isOffline: true,
          });
          _loadArticlesInFlight = null;
          return;
        }
      }

      set({ isLoading: false, error: error.message });
    } finally {
      _loadArticlesInFlight = null;
    }
  },

  loadMoreArticles: async () => {
    const { currentPage, hasMore } = get();
    if (!hasMore) return;
    await get().loadArticles(currentPage + 1, true);
  },

  refreshArticles: async () => {
    set({ isRefreshing: true });
    try {
      // Fetcha nuovi articoli dal backend (background task)
      const result = await apiService.fetchArticles();
      // Poll for task completion if backend returns task_id
      if (result?.task_id) {
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const taskStatus = await apiService.getTaskStatus(result.task_id);
            if (taskStatus.status === 'completed' || taskStatus.status === 'error') break;
          } catch { break; }
          attempts++;
        }
      }
      // Ricarica la lista
      await get().loadArticles(1, false);
      await cacheService.setLastSync();
      set({ lastSync: Date.now(), isRefreshing: false });
    } catch (error) {
      console.error('Error refreshing:', error);
      set({ isRefreshing: false, error: error.message });
    }
  },

  selectArticle: async (articleId) => {
    set({ isLoading: true });
    try {
      // Cache check
      const cached = await cacheService.getCachedArticleDetail(articleId);
      if (cached) {
        set({ selectedArticle: cached, isLoading: false });
        return;
      }

      const article = await apiService.getArticle(articleId);
      set({ selectedArticle: article, isLoading: false });
      await cacheService.cacheArticleDetail(articleId, article);
    } catch (error) {
      // Prova offline
      const cached = await cacheService.getCachedArticleDetailOffline(articleId);
      if (cached) {
        set({ selectedArticle: cached, isLoading: false, isOffline: true });
      } else {
        set({ isLoading: false, error: error.message });
      }
    }
  },

  analyzeArticle: async (articleId) => {
    set({ isLoading: true });
    try {
      const analyzed = await apiService.analyzeArticle(articleId);
      set({ selectedArticle: analyzed, isLoading: false });
      await cacheService.cacheArticleDetail(articleId, analyzed);

      // Aggiorna nella lista se presente
      const { articles } = get();
      const idx = articles.findIndex((a) => a.id === articleId);
      if (idx >= 0) {
        const updated = [...articles];
        updated[idx] = analyzed;
        set({ articles: updated });
      }

      return analyzed;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  // ── Filter Actions ────────────────────────────────────────────────────

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }));
    get().loadArticles(1, false);
  },

  clearFilters: () => {
    set({
      filters: { category: null, severity: null, feedId: null, search: '' },
    });
    get().loadArticles(1, false);
  },

  // ── Stats Actions ─────────────────────────────────────────────────────

  loadStats: async () => {
    try {
      const cached = await cacheService.getCachedStats();
      if (cached) set({ stats: cached });

      const stats = await apiService.getDashboardStats();
      set({ stats });
      await cacheService.cacheStats(stats);
    } catch (error) {
      const cached = await cacheService.getCachedStatsOffline();
      if (cached) set({ stats: cached });
    }
  },

  // ── Categories ────────────────────────────────────────────────────────

  loadCategories: async () => {
    try {
      const categories = await apiService.getCategories();
      set({ categories });
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  },

  // ── Report Actions ────────────────────────────────────────────────────

  generateReport: async (articleIds, title, language = 'it') => {
    set({ isLoading: true });
    try {
      const report = await apiService.generateReport(articleIds, title, language);
      set((state) => ({
        reports: [report, ...state.reports],
        isLoading: false,
      }));
      return report;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  // ── Settings Actions ──────────────────────────────────────────────────

  updateSettings: async (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    await cacheService.saveSettings(updated);
    if (newSettings.apiUrl) {
      apiService.setBaseUrl(newSettings.apiUrl);
    }
  },

  loadSettings: async () => {
    const saved = await cacheService.getSettings();
    if (saved) {
      set({ settings: { ...get().settings, ...saved } });
      if (saved.apiUrl) {
        apiService.setBaseUrl(saved.apiUrl);
      }
    }
    const lastSync = await cacheService.getLastSync();
    if (lastSync) set({ lastSync });
  },

  // ── AI & OPML Actions ────────────────────────────────────────────────

  loadAiStatus: async () => {
    try {
      const status = await apiService.getAiStatus();
      set({ aiStatus: status });
    } catch (error) {
      set({ aiStatus: { available: false, message: 'Backend non raggiungibile' } });
    }
  },

  loadAiConfig: async () => {
    try {
      const config = await apiService.getAiConfig();
      set({ aiConfig: config });
    } catch (error) {
      // ignore
    }
  },

  updateAiConfig: async (config) => {
    const result = await apiService.updateAiConfig(config);
    if (result.config) {
      set({ aiConfig: result.config });
    }
    // Refresh status after config change
    await get().loadAiStatus();
    return result;
  },

  testAiConnection: async () => {
    return apiService.testAiConnection();
  },

  importOpml: async (url) => {
    set({ isLoading: true });
    try {
      const result = await apiService.importOpml(url);
      await get().loadFeeds();
      set({ isLoading: false });
      return result;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  // ── Init ──────────────────────────────────────────────────────────────

  initialize: async () => {
    await get().loadSettings();
    await Promise.all([
      get().loadFeeds(),
      get().loadStats(),
      get().loadCategories(),
      get().loadAiStatus(),
    ]);
    await get().loadArticles(1, false);
  },
}));

export default useStore;
