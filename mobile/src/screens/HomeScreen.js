/**
 * Dashboard principale - Ricerca CTI e panoramica minacce.
 *
 * Notizie/articoli vengono caricati SOLO dopo una ricerca
 * (per keyword, IoC, categoria) — NON caricati tutti in automatico.
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import useStore from '../store/ArticleStore';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { severityColor, categoryColor } from '../theme';
import { severityLabel, categoryIcon, timeAgo } from '../utils/helpers';
import ProgressBar from '../components/ProgressBar';

export default function HomeScreen({ navigation }) {
  const {
    stats,
    categories,
    searchResults,
    searchTotal,
    searchSuggestions,
    isSearching,
    searchHasMore,
    watchlistAlertsCount,
    isRefreshing,
    isOffline,
    lastSync,
    loadStats,
    refreshArticles,
    initialize,
    searchArticles,
    clearSearch,
    loadMoreSearchResults,
    loadWatchlistAlerts,
    favoriteArticles,
    loadFavorites,
    batchAnalysisTask,
    dismissBatchAnalysis,
    refreshProgress,
  } = useStore();

  const [queryText, setQueryText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedSeverities, setSelectedSeverities] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  const onRefresh = useCallback(async () => {
    await refreshArticles();
    await loadStats();
    await loadWatchlistAlerts();
  }, []);

  const executeSearch = useCallback(async (overrideQuery) => {
    const q = overrideQuery !== undefined ? overrideQuery : queryText;
    const searchQuery = {
      query: q.trim(),
      categories: selectedCategories,
      severities: selectedSeverities,
      ai_score: true,
      page_size: 20,
    };
    setHasSearched(true);
    await searchArticles(searchQuery, 1, false);
  }, [queryText, selectedCategories, selectedSeverities, searchArticles]);

  const handleCategoryToggle = useCallback((catId) => {
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  }, []);

  const handleSeverityToggle = useCallback((sev) => {
    setSelectedSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
    );
  }, []);

  const handleArticlePress = useCallback(
    (article) => {
      navigation.navigate('Feed', {
        screen: 'ArticleDetail',
        params: { articleId: article.id, title: article.title },
      });
    },
    [navigation]
  );

  const handleSuggestionPress = useCallback((suggestion) => {
    setQueryText(suggestion);
    executeSearch(suggestion);
  }, [executeSearch]);

  const severities = ['critical', 'high', 'medium', 'low', 'informational'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>CTI Search</Text>
            <Text style={styles.headerSubtitle}>
              {isOffline ? '⚡ Modalità offline' : lastSync ? `Sync: ${timeAgo(new Date(lastSync))}` : 'Cerca notizie per keyword, IoC, categoria'}
            </Text>
          </View>
          {watchlistAlertsCount > 0 && (
            <TouchableOpacity
              style={styles.alertBadge}
              onPress={() => navigation.navigate('Watchlist')}
            >
              <Ionicons name="notifications" size={18} color={colors.white} />
              <Text style={styles.alertBadgeText}>{watchlistAlertsCount}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cerca IP, hash, CVE, keyword..."
              placeholderTextColor={colors.textMuted}
              value={queryText}
              onChangeText={setQueryText}
              onSubmitEditing={() => executeSearch()}
              returnKeyType="search"
            />
            {queryText.length > 0 && (
              <TouchableOpacity onPress={() => { setQueryText(''); clearSearch(); setHasSearched(false); }}>
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={() => executeSearch()}>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Severity Filters */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Severità</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {severities.map((sev) => (
              <TouchableOpacity
                key={sev}
                style={[
                  styles.filterChip,
                  selectedSeverities.includes(sev) && { backgroundColor: severityColor(sev), borderColor: severityColor(sev) },
                ]}
                onPress={() => handleSeverityToggle(sev)}
              >
                <View style={[styles.severityDot, { backgroundColor: severityColor(sev) }]} />
                <Text
                  style={[
                    styles.filterChipText,
                    selectedSeverities.includes(sev) && { color: colors.white },
                  ]}
                >
                  {severityLabel(sev)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Category Filters */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Categorie</Text>
          <View style={styles.categoryGrid}>
            {(categories || []).filter(c => c.id !== 'unknown').map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryChip,
                  selectedCategories.includes(cat.id) && { backgroundColor: categoryColor(cat.id), borderColor: categoryColor(cat.id) },
                ]}
                onPress={() => handleCategoryToggle(cat.id)}
              >
                <Ionicons
                  name={categoryIcon(cat.id)}
                  size={14}
                  color={selectedCategories.includes(cat.id) ? colors.white : categoryColor(cat.id)}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategories.includes(cat.id) && { color: colors.white },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Filters + Search Button */}
        {(selectedCategories.length > 0 || selectedSeverities.length > 0) && (
          <View style={styles.activeFilters}>
            <Text style={styles.activeFiltersText}>
              {selectedCategories.length + selectedSeverities.length} filtri attivi
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSelectedCategories([]);
                setSelectedSeverities([]);
              }}
            >
              <Text style={styles.clearFiltersText}>Resetta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterSearchBtn} onPress={() => executeSearch()}>
              <Ionicons name="search" size={16} color={colors.white} />
              <Text style={styles.filterSearchBtnText}>Cerca</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading */}
        {isSearching && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Ricerca e scoring AI in corso...</Text>
          </View>
        )}

        {/* AI Suggestions */}
        {searchSuggestions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bulb-outline" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>Suggerimenti AI</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {searchSuggestions.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.suggestionChip}
                  onPress={() => handleSuggestionPress(s)}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search Results */}
        {hasSearched && !isSearching && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {searchTotal > 0 ? `${searchTotal} risultati trovati` : 'Nessun risultato'}
            </Text>
            {searchResults.map((result, idx) => (
              <TouchableOpacity
                key={result.article?.id || idx}
                style={styles.resultCard}
                onPress={() => handleArticlePress(result.article)}
              >
                <View style={styles.resultHeader}>
                  <View style={[styles.scoreBadge, { backgroundColor: _scoreColor(result.relevance_score) }]}>
                    <Text style={styles.scoreText}>{Math.round((result.relevance_score || 0) * 100)}%</Text>
                  </View>
                  <View
                    style={[
                      styles.severityBadge,
                      { backgroundColor: severityColor(result.article?.analysis?.severity || 'informational') },
                    ]}
                  >
                    <Text style={styles.severityBadgeText}>
                      {(result.article?.analysis?.severity || 'info').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.resultFeed} numberOfLines={1}>
                    {result.article?.feed_name || result.article?.feed_id || ''}
                  </Text>
                </View>
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {result.article?.title}
                </Text>
                {result.match_reasons?.length > 0 && (
                  <Text style={styles.resultReason} numberOfLines={1}>
                    {result.match_reasons[0]}
                  </Text>
                )}
                {result.ai_suggestion ? (
                  <Text style={styles.resultSuggestion} numberOfLines={2}>
                    {result.ai_suggestion}
                  </Text>
                ) : null}
                {result.article?.analysis?.summary_it ? (
                  <Text style={styles.resultSummary} numberOfLines={2}>
                    {result.article.analysis.summary_it}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}

            {searchHasMore && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreSearchResults}>
                <Text style={styles.loadMoreText}>Carica altri risultati</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Quick Stats (only when no search active) */}
        {!hasSearched && stats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Panoramica</Text>
            <View style={styles.statsRow}>
              <StatCard icon="newspaper-outline" value={stats.total_articles || 0} label="In cache" color={colors.primary} />
              <StatCard icon="analytics-outline" value={stats.analyzed_articles || 0} label="Analizzati" color={colors.success} />
              <StatCard icon="wifi-outline" value={stats.active_feeds || 0} label="Feed" color={colors.accent} />
              <StatCard icon="eye-outline" value={watchlistAlertsCount} label="Alert" color={colors.critical} />
            </View>
          </View>
        )}

        {/* Batch Analysis Progress */}
        {batchAnalysisTask && (batchAnalysisTask.status === 'running' || batchAnalysisTask.status === 'pending' || batchAnalysisTask.status === 'completed') && (
          <ProgressBar
            progress={batchAnalysisTask.progress || 0}
            total={batchAnalysisTask.total || 0}
            analyzed={batchAnalysisTask.analyzed?.length || 0}
            errors={batchAnalysisTask.errors?.length || 0}
            status={batchAnalysisTask.status}
            startedAt={batchAnalysisTask.created_at}
            label="Analisi AI Batch"
            onDismiss={batchAnalysisTask.status === 'completed' || batchAnalysisTask.status === 'error' ? dismissBatchAnalysis : null}
          />
        )}

        {/* Refresh Progress */}
        {refreshProgress && (
          <ProgressBar
            progress={refreshProgress.progress || 0}
            total={refreshProgress.total || 0}
            status={refreshProgress.status || 'running'}
            label={refreshProgress.label || 'Scaricamento...'}
            compact
          />
        )}

        {/* Favorites (only when no search active) */}
        {!hasSearched && favoriteArticles.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="bookmark" size={18} color={colors.warning} />
              <Text style={styles.sectionTitle}>Preferiti ({favoriteArticles.length})</Text>
            </View>
            {favoriteArticles.slice(0, 5).map((article, idx) => (
              <TouchableOpacity
                key={article.id || idx}
                style={styles.resultCard}
                onPress={() => handleArticlePress(article)}
              >
                <View style={styles.resultHeader}>
                  <Ionicons name="bookmark" size={14} color={colors.warning} />
                  <View
                    style={[
                      styles.severityBadge,
                      { backgroundColor: severityColor(article.analysis?.severity || 'informational') },
                    ]}
                  >
                    <Text style={styles.severityBadgeText}>
                      {(article.analysis?.severity || 'info').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.resultFeed} numberOfLines={1}>
                    {article.feed_name || article.feed_id || ''}
                  </Text>
                </View>
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {article.title}
                </Text>
                {article.analysis?.summary_it ? (
                  <Text style={styles.resultSummary} numberOfLines={2}>
                    {article.analysis.summary_it}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function _scoreColor(score) {
  if (score >= 0.8) return colors.success;
  if (score >= 0.5) return colors.warning;
  return colors.textMuted;
}

function StatCard({ icon, value, label, color }) {
  return (
    <View style={[styles.statCard, shadows.sm]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.critical,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  alertBadgeText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSection: {
    marginBottom: spacing.md,
  },
  filterLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipText: {
    fontSize: fontSize.xs,
    color: colors.text,
  },
  activeFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  activeFiltersText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  clearFiltersText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  filterSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  filterSearchBtnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  suggestionChip: {
    backgroundColor: colors.accent + '20',
    borderRadius: borderRadius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  suggestionText: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  scoreBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    minWidth: 40,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  severityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  severityBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  resultFeed: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },
  resultTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  resultReason: {
    fontSize: fontSize.xs,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  resultSuggestion: {
    fontSize: fontSize.xs,
    color: colors.primaryLight,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  resultSummary: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  loadMoreBtn: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  loadMoreText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
