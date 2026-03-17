/**
 * Dashboard principale - panoramica delle minacce CTI.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import useStore from '../store/ArticleStore';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { severityLabel, categoryLabel, categoryIcon, timeAgo } from '../utils/helpers';
import { severityColor, categoryColor } from '../theme';

export default function HomeScreen({ navigation }) {
  const {
    stats,
    articles,
    isRefreshing,
    isOffline,
    lastSync,
    loadStats,
    refreshArticles,
    initialize,
  } = useStore();

  useEffect(() => {
    initialize();
  }, []);

  const onRefresh = useCallback(async () => {
    await refreshArticles();
    await loadStats();
  }, []);

  // Articoli recenti (top 5)
  const recentArticles = articles
    .filter((a) => a.status === 'analyzed' && a.analysis)
    .slice(0, 5);

  // Distribuzione per severità
  const severityData = stats?.articles_by_severity || {};
  const categoryData = stats?.articles_by_category || {};

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
            <Text style={styles.headerTitle}>CTI Dashboard</Text>
            <Text style={styles.headerSubtitle}>
              {isOffline ? '⚡ Modalità offline' : lastSync ? `Ultimo sync: ${timeAgo(new Date(lastSync))}` : 'Non ancora sincronizzato'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.syncButton}
            onPress={onRefresh}
            disabled={isRefreshing}
          >
            <Ionicons name="sync-outline" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <StatCard
            icon="newspaper-outline"
            value={stats?.total_articles || 0}
            label="Articoli"
            color={colors.primary}
          />
          <StatCard
            icon="analytics-outline"
            value={stats?.analyzed_articles || 0}
            label="Analizzati"
            color={colors.success}
          />
          <StatCard
            icon="time-outline"
            value={stats?.pending_articles || 0}
            label="In attesa"
            color={colors.warning}
          />
          <StatCard
            icon="wifi-outline"
            value={stats?.active_feeds || 0}
            label="Feed attivi"
            color={colors.accent}
          />
        </View>

        {/* Severity Distribution */}
        {Object.keys(severityData).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Distribuzione Severità</Text>
            <View style={styles.severityRow}>
              {Object.entries(severityData)
                .sort((a, b) => b[1] - a[1])
                .map(([sev, count]) => (
                  <View key={sev} style={styles.severityItem}>
                    <View
                      style={[
                        styles.severityDot,
                        { backgroundColor: severityColor(sev) },
                      ]}
                    />
                    <Text style={styles.severityLabel}>{severityLabel(sev)}</Text>
                    <Text style={styles.severityCount}>{count}</Text>
                  </View>
                ))}
            </View>
          </View>
        )}

        {/* Category Distribution */}
        {Object.keys(categoryData).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settori Colpiti</Text>
            <View style={styles.categoryGrid}>
              {Object.entries(categoryData)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([cat, count]) => (
                  <TouchableOpacity
                    key={cat}
                    style={styles.categoryCard}
                    onPress={() => {
                      navigation.navigate('Feed', {
                        screen: 'FeedList',
                        params: { category: cat },
                      });
                    }}
                  >
                    <Ionicons
                      name={categoryIcon(cat)}
                      size={20}
                      color={categoryColor(cat)}
                    />
                    <Text style={styles.categoryName}>{categoryLabel(cat)}</Text>
                    <Text style={styles.categoryCount}>{count}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        )}

        {/* Threat Actors Recenti */}
        {stats?.recent_threat_actors?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Threat Actor Recenti</Text>
            <View style={styles.tagsWrap}>
              {stats.recent_threat_actors.map((ta) => (
                <View key={ta} style={styles.threatActorTag}>
                  <Ionicons name="skull-outline" size={12} color={colors.critical} />
                  <Text style={styles.threatActorText}>{ta}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Articoli Recenti */}
        {recentArticles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ultime Analisi</Text>
            {recentArticles.map((article) => (
              <TouchableOpacity
                key={article.id}
                style={styles.recentArticle}
                onPress={() =>
                  navigation.navigate('Feed', {
                    screen: 'ArticleDetail',
                    params: { articleId: article.id, title: article.title },
                  })
                }
              >
                <View style={styles.recentArticleHeader}>
                  <View
                    style={[
                      styles.severityBadge,
                      {
                        backgroundColor: severityColor(
                          article.analysis?.severity || 'informational'
                        ),
                      },
                    ]}
                  >
                    <Text style={styles.severityBadgeText}>
                      {(article.analysis?.severity || 'info').toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.recentArticleFeed}>
                    {article.feed_name || article.feed_id}
                  </Text>
                </View>
                <Text style={styles.recentArticleTitle} numberOfLines={2}>
                  {article.title}
                </Text>
                {article.analysis?.summary_it && (
                  <Text style={styles.recentArticleSummary} numberOfLines={2}>
                    {article.analysis.summary_it}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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
    marginBottom: spacing.xl,
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
  syncButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
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
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  severityRow: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  severityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  severityLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  severityCount: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryName: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  categoryCount: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  threatActorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.critical + '30',
  },
  threatActorText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  recentArticle: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  recentArticleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
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
  recentArticleFeed: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  recentArticleTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  recentArticleSummary: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
