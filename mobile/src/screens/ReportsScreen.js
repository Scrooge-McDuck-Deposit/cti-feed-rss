/**
 * Schermata Report - generazione e visualizzazione report tecnici.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../store/ArticleStore';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { severityColor } from '../theme';
import { formatDate, severityLabel } from '../utils/helpers';

export default function ReportsScreen({ navigation }) {
  const {
    articles,
    reports,
    isLoading,
    generateReport,
  } = useStore();

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showSelector, setShowSelector] = useState(false);
  const [generating, setGenerating] = useState(false);

  const analyzedArticles = articles.filter(
    (a) => a.status === 'analyzed' && a.analysis
  );

  const toggleArticle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (selectedIds.size === 0) {
      Alert.alert('Attenzione', 'Seleziona almeno un articolo analizzato.');
      return;
    }

    setGenerating(true);
    try {
      const report = await generateReport(Array.from(selectedIds));
      setSelectedIds(new Set());
      setShowSelector(false);
      Alert.alert('Successo', 'Report tecnico generato con successo!');
    } catch (error) {
      Alert.alert('Errore', 'Impossibile generare il report: ' + error.message);
    } finally {
      setGenerating(false);
    }
  }, [selectedIds, generateReport]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.description}>
          Genera report tecnici combinando le analisi AI di più articoli.
          I report includono IoC, tecniche MITRE ATT&CK e bundle STIX.
        </Text>
        <TouchableOpacity
          style={styles.newReportButton}
          onPress={() => setShowSelector(!showSelector)}
        >
          <Ionicons
            name={showSelector ? 'close' : 'add'}
            size={20}
            color={colors.white}
          />
          <Text style={styles.newReportButtonText}>
            {showSelector ? 'Annulla' : 'Nuovo Report'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Article Selector */}
      {showSelector && (
        <View style={styles.selectorSection}>
          <Text style={styles.selectorTitle}>
            Seleziona articoli ({selectedIds.size} selezionati)
          </Text>
          {analyzedArticles.length === 0 ? (
            <View style={styles.emptySelector}>
              <Text style={styles.emptySelectorText}>
                Nessun articolo analizzato disponibile.
                Vai al Feed e analizza degli articoli prima.
              </Text>
            </View>
          ) : (
            <>
              {analyzedArticles.slice(0, 20).map((article) => (
                <TouchableOpacity
                  key={article.id}
                  style={[
                    styles.selectorItem,
                    selectedIds.has(article.id) && styles.selectorItemSelected,
                  ]}
                  onPress={() => toggleArticle(article.id)}
                >
                  <Ionicons
                    name={
                      selectedIds.has(article.id)
                        ? 'checkbox'
                        : 'square-outline'
                    }
                    size={22}
                    color={
                      selectedIds.has(article.id)
                        ? colors.primary
                        : colors.textMuted
                    }
                  />
                  <View style={styles.selectorItemContent}>
                    <Text style={styles.selectorItemTitle} numberOfLines={2}>
                      {article.title}
                    </Text>
                    <View style={styles.selectorItemMeta}>
                      <View
                        style={[
                          styles.miniSeverityBadge,
                          {
                            backgroundColor: severityColor(
                              article.analysis?.severity || 'informational'
                            ),
                          },
                        ]}
                      >
                        <Text style={styles.miniSeverityText}>
                          {article.analysis?.severity?.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.selectorItemFeed}>
                        {article.feed_name || article.feed_id}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[
                  styles.generateButton,
                  selectedIds.size === 0 && styles.generateButtonDisabled,
                ]}
                onPress={handleGenerate}
                disabled={generating || selectedIds.size === 0}
              >
                {generating ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons
                      name="document-text"
                      size={18}
                      color={colors.white}
                    />
                    <Text style={styles.generateButtonText}>
                      Genera Report ({selectedIds.size} articoli)
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Reports List */}
      <Text style={styles.reportsTitle}>Report Generati</Text>

      {reports.length === 0 ? (
        <View style={styles.emptyReports}>
          <Ionicons name="document-text-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyReportsTitle}>Nessun report</Text>
          <Text style={styles.emptyReportsSubtitle}>
            Genera il tuo primo report selezionando articoli analizzati
          </Text>
        </View>
      ) : (
        reports.map((report) => (
          <View key={report.id} style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <View
                style={[
                  styles.severityBadge,
                  { backgroundColor: severityColor(report.severity) },
                ]}
              >
                <Text style={styles.severityBadgeText}>
                  {severityLabel(report.severity)}
                </Text>
              </View>
              <Text style={styles.reportDate}>
                {formatDate(report.created_at)}
              </Text>
            </View>

            <Text style={styles.reportTitle}>{report.title}</Text>

            {report.executive_summary && (
              <Text style={styles.reportSummary} numberOfLines={4}>
                {report.executive_summary}
              </Text>
            )}

            {/* Stats del report */}
            <View style={styles.reportStats}>
              <View style={styles.reportStat}>
                <Ionicons name="newspaper-outline" size={14} color={colors.textMuted} />
                <Text style={styles.reportStatText}>
                  {report.article_ids?.length || 0} articoli
                </Text>
              </View>
              <View style={styles.reportStat}>
                <Ionicons name="bug-outline" size={14} color={colors.textMuted} />
                <Text style={styles.reportStatText}>
                  {report.indicators_of_compromise?.length || 0} IoC
                </Text>
              </View>
              <View style={styles.reportStat}>
                <Ionicons name="git-network-outline" size={14} color={colors.textMuted} />
                <Text style={styles.reportStatText}>
                  {report.attack_techniques?.length || 0} tecniche
                </Text>
              </View>
              {report.stix_bundle && (
                <View style={styles.reportStat}>
                  <Ionicons name="code-slash-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.reportStatText}>STIX</Text>
                </View>
              )}
            </View>

            {/* Tecniche MITRE nel report */}
            {report.attack_techniques?.length > 0 && (
              <View style={styles.reportTechniques}>
                {report.attack_techniques.slice(0, 5).map((tech, i) => (
                  <View key={i} style={styles.techChip}>
                    <Text style={styles.techChipText}>{tech.technique_id}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Dettagli tecnici (espandibile) */}
            {report.technical_details && (
              <View style={styles.reportDetails}>
                <Text style={styles.reportDetailsTitle}>Dettagli Tecnici</Text>
                <Text style={styles.reportDetailsText}>
                  {report.technical_details}
                </Text>
              </View>
            )}

            {/* Raccomandazioni */}
            {report.recommendations?.length > 0 && (
              <View style={styles.reportRecs}>
                <Text style={styles.reportDetailsTitle}>Raccomandazioni</Text>
                {report.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recItem}>
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={colors.success}
                    />
                    <Text style={styles.recItemText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  header: {
    marginBottom: spacing.xl,
  },
  description: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  newReportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  newReportButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  // Selector
  selectorSection: {
    marginBottom: spacing.xl,
  },
  selectorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  selectorItemContent: {
    flex: 1,
  },
  selectorItemTitle: {
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  selectorItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  miniSeverityBadge: {
    paddingVertical: 1,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  miniSeverityText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
  },
  selectorItemFeed: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  emptySelector: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptySelectorText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    marginTop: spacing.md,
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.white,
  },
  // Reports
  reportsTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  emptyReports: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyReportsTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
  },
  emptyReportsSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  reportCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  severityBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  severityBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  reportDate: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  reportTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  reportSummary: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  reportStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  reportStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reportStatText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  reportTechniques: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  techChip: {
    backgroundColor: colors.primaryDark,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  techChipText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.white,
    fontFamily: 'monospace',
  },
  reportDetails: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.md,
  },
  reportDetailsTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  reportDetailsText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  reportRecs: {
    marginTop: spacing.md,
  },
  recItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  recItemText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
