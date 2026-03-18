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

  // Search
  searchResults: [],
  searchTotal: 0,
  searchPage: 1,
  searchHasMore: false,
  searchQuery: null,
  searchSuggestions: [],
  isSearching: false,

  // Watchlist
  watchlist: [],
  watchlistAlerts: [],
  watchlistAlertsCount: 0,

  // Favorites
  favorites: new Set(),
  favoriteArticles: [],

  // Excluded Sources
  excludedSources: [],

  // Batch Analysis
  batchAnalysisTask: null,

  // Refresh progress (feed fetch)
  refreshProgress: null,

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
    set({ isRefreshing: true, refreshProgress: { phase: 'fetch', label: 'Scaricamento feed...' } });
    try {
      // Fetcha nuovi articoli dal backend (background task)
      const result = await apiService.fetchArticles();
      // Poll for task completion if backend returns task_id
      if (result?.task_id) {
        let attempts = 0;
        while (attempts < 60) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const taskStatus = await apiService.getTaskStatus(result.task_id);
            set({ refreshProgress: { phase: 'fetch', label: 'Scaricamento feed...', ...taskStatus } });
            if (taskStatus.status === 'completed' || taskStatus.status === 'error') break;
          } catch { break; }
          attempts++;
        }
      }
      set({ refreshProgress: { phase: 'loading', label: 'Caricamento articoli...' } });
      // Ricarica la lista
      await get().loadArticles(1, false);
      await cacheService.setLastSync();
      set({ lastSync: Date.now(), isRefreshing: false, refreshProgress: null });
    } catch (error) {
      console.error('Error refreshing:', error);
      set({ isRefreshing: false, refreshProgress: null, error: error.message });
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

  // ── Search Actions ────────────────────────────────────────────────────

  searchArticles: async (searchQuery, page = 1, append = false) => {
    set({ isSearching: !append, searchQuery: searchQuery });
    try {
      const result = await apiService.searchArticles({
        ...searchQuery,
        page,
      });
      set({
        searchResults: append
          ? [...get().searchResults, ...result.results]
          : result.results,
        searchTotal: result.total,
        searchPage: result.page,
        searchHasMore: result.has_next,
        searchSuggestions: result.ai_suggestions || [],
        isSearching: false,
      });
      return result;
    } catch (error) {
      console.error('Search error:', error);
      set({ isSearching: false, error: error.message });
      throw error;
    }
  },

  loadMoreSearchResults: async () => {
    const { searchPage, searchHasMore, searchQuery } = get();
    if (!searchHasMore || !searchQuery) return;
    await get().searchArticles(searchQuery, searchPage + 1, true);
  },

  clearSearch: () => {
    set({
      searchResults: [],
      searchTotal: 0,
      searchPage: 1,
      searchHasMore: false,
      searchQuery: null,
      searchSuggestions: [],
    });
  },

  // ── Favorites Actions ────────────────────────────────────────────────

  loadFavorites: async () => {
    try {
      const data = await apiService.getFavorites();
      set({
        favorites: new Set(data.favorite_ids || []),
        favoriteArticles: data.articles || [],
      });
    } catch (error) {
      console.error('Favorites load error:', error);
    }
  },

  toggleFavorite: async (articleId) => {
    const { favorites } = get();
    const isFav = favorites.has(articleId);
    try {
      if (isFav) {
        await apiService.removeFavorite(articleId);
        const newFavs = new Set(favorites);
        newFavs.delete(articleId);
        set({
          favorites: newFavs,
          favoriteArticles: get().favoriteArticles.filter(a => a.id !== articleId),
        });
      } else {
        await apiService.addFavorite(articleId);
        const newFavs = new Set(favorites);
        newFavs.add(articleId);
        set({ favorites: newFavs });
        // Reload to get full article data
        const data = await apiService.getFavorites();
        set({ favoriteArticles: data.articles || [] });
      }
    } catch (error) {
      console.error('Toggle favorite error:', error);
    }
  },

  isFavorite: (articleId) => {
    return get().favorites.has(articleId);
  },

  // ── Excluded Sources Actions ──────────────────────────────────────────

  loadExcludedSources: async () => {
    try {
      const data = await apiService.getExcludedSources();
      set({ excludedSources: data.excluded || [] });
    } catch (error) {
      console.error('Excluded sources load error:', error);
    }
  },

  excludeSource: async (feedId) => {
    try {
      await apiService.excludeSource(feedId);
      await get().loadExcludedSources();
      // Reload articles to reflect the change
      await get().loadArticles(1, false);
    } catch (error) {
      console.error('Exclude source error:', error);
      throw error;
    }
  },

  reenableSource: async (feedId) => {
    try {
      await apiService.reenableSource(feedId);
      await get().loadExcludedSources();
      await get().loadArticles(1, false);
    } catch (error) {
      console.error('Reenable source error:', error);
      throw error;
    }
  },

  // ── Batch Analysis Actions ────────────────────────────────────────────

  startBatchAnalysis: async (articleIds = null, batchSize = 5) => {
    try {
      const result = await apiService.analyzeBatch(articleIds, batchSize);
      set({ batchAnalysisTask: result });

      // Poll for progress (faster interval for responsive UI)
      if (result?.task_id) {
        const poll = async () => {
          let attempts = 0;
          while (attempts < 200) {
            await new Promise((r) => setTimeout(r, 1500));
            try {
              const status = await apiService.getTaskStatus(result.task_id);
              set({ batchAnalysisTask: status });
              if (status.status === 'completed' || status.status === 'error') {
                // Reload articles after completion
                await get().loadArticles(1, false);
                break;
              }
            } catch { break; }
            attempts++;
          }
        };
        poll(); // fire and forget
      }

      return result;
    } catch (error) {
      console.error('Batch analysis error:', error);
      throw error;
    }
  },

  dismissBatchAnalysis: () => {
    set({ batchAnalysisTask: null });
  },

  // ── Demo Actions ──────────────────────────────────────────────────────

  createDemoArticle: async () => {
    try {
      const article = await apiService.createDemoArticle();
      return article;
    } catch (error) {
      console.error('Demo article error:', error);
      throw error;
    }
  },

  // ── Watchlist Actions ─────────────────────────────────────────────────

  loadWatchlist: async () => {
    try {
      const watchlist = await apiService.getWatchlist();
      set({ watchlist });
    } catch (error) {
      console.error('Watchlist load error:', error);
    }
  },

  addWatchlistAsset: async (assetType, value, label) => {
    const asset = await apiService.addWatchlistAsset(assetType, value, label);
    set((state) => ({ watchlist: [...state.watchlist, asset] }));
    return asset;
  },

  removeWatchlistAsset: async (assetId) => {
    await apiService.removeWatchlistAsset(assetId);
    set((state) => ({
      watchlist: state.watchlist.filter((a) => a.id !== assetId),
    }));
  },

  toggleWatchlistAsset: async (assetId) => {
    const updated = await apiService.toggleWatchlistAsset(assetId);
    set((state) => ({
      watchlist: state.watchlist.map((a) => (a.id === assetId ? updated : a)),
    }));
  },

  loadWatchlistAlerts: async () => {
    try {
      const data = await apiService.getWatchlistAlerts();
      set({
        watchlistAlerts: data.alerts || [],
        watchlistAlertsCount: data.total_alerts || 0,
      });
    } catch (error) {
      console.error('Watchlist alerts error:', error);
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
      get().loadWatchlist(),
      get().loadWatchlistAlerts(),
      get().loadFavorites(),
      get().loadExcludedSources(),
    ]);
    // Non carichiamo articoli automaticamente:
    // l'utente li cerca on-demand tramite ricerca o categoria
  },
}));

export default useStore;
