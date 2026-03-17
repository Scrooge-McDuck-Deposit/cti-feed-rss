/**
 * Card articolo per la lista feed.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { severityColor, categoryColor } from '../theme';
import {
  timeAgo,
  truncateText,
  severityLabel,
  categoryLabel,
  categoryIcon,
} from '../utils/helpers';

function ArticleCard({ article, onPress }) {
  const analysis = article.analysis;
  const hasAnalysis = article.status === 'analyzed' && analysis;

  return (
    <TouchableOpacity
      style={[styles.card, shadows.sm]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Top Row: Feed + Date */}
      <View style={styles.topRow}>
        <Text style={styles.feedName} numberOfLines={1}>
          {article.feed_name || article.feed_id}
        </Text>
        <Text style={styles.date}>
          {timeAgo(article.published || article.fetched_at)}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>
        {article.title}
      </Text>

      {/* Summary */}
      {(hasAnalysis ? analysis.summary_it : article.summary) ? (
        <Text style={styles.summary} numberOfLines={2}>
          {truncateText(
            hasAnalysis ? analysis.summary_it : article.summary,
            200
          )}
        </Text>
      ) : null}

      {/* Badges Row */}
      <View style={styles.badgeRow}>
        {hasAnalysis ? (
          <>
            {/* Severity Badge */}
            <View
              style={[
                styles.badge,
                { backgroundColor: severityColor(analysis.severity) },
              ]}
            >
              <Text style={styles.badgeText}>
                {severityLabel(analysis.severity)}
              </Text>
            </View>

            {/* Category Badge */}
            <View
              style={[
                styles.badge,
                { backgroundColor: categoryColor(analysis.threat_category) + '30' },
              ]}
            >
              <Ionicons
                name={categoryIcon(analysis.threat_category)}
                size={10}
                color={categoryColor(analysis.threat_category)}
              />
              <Text
                style={[
                  styles.badgeText,
                  { color: categoryColor(analysis.threat_category) },
                ]}
              >
                {categoryLabel(analysis.threat_category)}
              </Text>
            </View>

            {/* IoC count */}
            {analysis.indicators?.length > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.surfaceLight }]}>
                <Ionicons name="bug-outline" size={10} color={colors.warning} />
                <Text style={[styles.badgeText, { color: colors.warning }]}>
                  {analysis.indicators.length} IoC
                </Text>
              </View>
            )}

            {/* Techniques count */}
            {analysis.attack_techniques?.length > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.surfaceLight }]}>
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  {analysis.attack_techniques.length} MITRE
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={[styles.badge, { backgroundColor: colors.surfaceLight }]}>
            <Ionicons name="time-outline" size={10} color={colors.warning} />
            <Text style={[styles.badgeText, { color: colors.warning }]}>
              Da analizzare
            </Text>
          </View>
        )}

        {/* Tags */}
        {article.tags?.slice(0, 2).map((tag, i) => (
          <View
            key={i}
            style={[styles.badge, { backgroundColor: colors.surfaceLight }]}
          >
            <Text style={[styles.badgeText, { color: colors.textMuted }]}>
              {tag}
            </Text>
          </View>
        ))}
      </View>

      {/* Threat Actors */}
      {hasAnalysis && analysis.threat_actors?.length > 0 && (
        <View style={styles.taRow}>
          <Ionicons name="skull-outline" size={12} color={colors.critical} />
          <Text style={styles.taText} numberOfLines={1}>
            {analysis.threat_actors.map((ta) => ta.name).join(', ')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default memo(ArticleCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  feedName: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
    flex: 1,
    marginRight: spacing.md,
  },
  date: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  summary: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.white,
  },
  taRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  taText: {
    fontSize: fontSize.sm,
    color: colors.critical,
    fontWeight: '500',
    flex: 1,
  },
});
