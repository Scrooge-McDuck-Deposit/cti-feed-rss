/**
 * Schermata dettaglio articolo con analisi AI, IoC, STIX e report.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../store/ArticleStore';
import StixViewer from '../components/StixViewer';
import apiService from '../services/api';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { severityColor, categoryColor } from '../theme';
import {
  formatDate,
  severityLabel,
  categoryLabel,
  categoryIcon,
  truncateText,
} from '../utils/helpers';

export default function ArticleDetailScreen({ route }) {
  const { articleId } = route.params;
  const {
    selectedArticle: article,
    isLoading,
    selectArticle,
    analyzeArticle,
    generateReport,
    toggleFavorite,
    isFavorite,
    excludeSource,
  } = useStore();

  const [activeTab, setActiveTab] = useState('summary');
  const [analyzing, setAnalyzing] = useState(false);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [actionItems, setActionItems] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    selectArticle(articleId);
  }, [articleId]);

  // Check favorite status
  useEffect(() => {
    setIsFav(isFavorite(articleId));
  }, [articleId, useStore.getState().favorites]);

  // Auto-analyze when article is loaded but not yet analyzed
  useEffect(() => {
    if (article && article.id === articleId && article.status !== 'analyzed' && !autoAnalyzing && !analyzing) {
      setAutoAnalyzing(true);
      analyzeArticle(articleId)
        .catch(() => {})
        .finally(() => setAutoAnalyzing(false));
    }
  }, [article, articleId]);

  const handleToggleFavorite = useCallback(async () => {
    await toggleFavorite(articleId);
    setIsFav(!isFav);
  }, [articleId, isFav]);

  const handleShowActions = useCallback(async () => {
    if (showActions) {
      setShowActions(false);
      return;
    }
    setLoadingActions(true);
    setShowActions(true);
    try {
      const data = await apiService.getArticleActions(articleId);
      setActionItems(data.actions || []);
    } catch (error) {
      setActionItems([{ priority: 'low', icon: 'alert-circle', action: 'Impossibile caricare le azioni' }]);
    } finally {
      setLoadingActions(false);
    }
  }, [articleId, showActions]);

  const handleExcludeSource = useCallback(() => {
    if (!article) return;
    Alert.alert(
      'Disabilita Sorgente',
      `Vuoi disabilitare il feed "${article.feed_name || article.feed_id}"? Gli articoli da questa sorgente non appariranno più.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Disabilita',
          style: 'destructive',
          onPress: async () => {
            try {
              await excludeSource(article.feed_id);
              Alert.alert('Fatto', 'Sorgente disabilitata. Puoi riabilitarla dalle Impostazioni.');
            } catch (error) {
              Alert.alert('Errore', error.message || 'Impossibile disabilitare la sorgente');
            }
          },
        },
      ]
    );
  }, [article]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      await analyzeArticle(articleId);
    } catch (error) {
      Alert.alert('Errore', "Impossibile analizzare l'articolo: " + error.message);
    } finally {
      setAnalyzing(false);
    }
  }, [articleId]);

  const handleGenerateReport = useCallback(async () => {
    setGeneratingReport(true);
    try {
      const report = await generateReport([articleId], article?.title);
      Alert.alert('Report Generato', 'Il report tecnico è stato creato con successo.');
    } catch (error) {
      Alert.alert('Errore', 'Impossibile generare il report: ' + error.message);
    } finally {
      setGeneratingReport(false);
    }
  }, [articleId, article]);

  const handleShare = useCallback(async () => {
    if (!article) return;
    try {
      let message = `🛡️ CTI Alert: ${article.title}\n`;
      if (article.analysis?.severity) {
        message += `⚠️ Severità: ${severityLabel(article.analysis.severity)}\n`;
      }
      if (article.analysis?.summary_it) {
        message += `\n${truncateText(article.analysis.summary_it, 200)}\n`;
      }
      message += `\n🔗 ${article.link}`;
      await Share.share({ message });
    } catch (error) {
      // Utente ha cancellato
    }
  }, [article]);

  const handleExport = useCallback(async (format) => {
    setExporting(format);
    setShowExportMenu(false);
    try {
      let data;
      let shareContent;
      switch (format) {
        case 'misp':
          data = await apiService.getArticleMISP(articleId);
          shareContent = JSON.stringify(data, null, 2);
          break;
        case 'yara':
          data = await apiService.getArticleYARA(articleId);
          shareContent = typeof data === 'string' ? data : JSON.stringify(data);
          break;
        case 'sigma':
          data = await apiService.getArticleSigma(articleId);
          shareContent = typeof data === 'string' ? data : JSON.stringify(data);
          break;
        case 'thehive':
          const thResult = await apiService.exportToTheHive(articleId);
          Alert.alert('TheHive', thResult.success ? 'Alert inviato con successo' : thResult.error || 'Errore');
          return;
        case 'qradar':
          const qrResult = await apiService.exportToQRadar(articleId);
          Alert.alert('QRadar', qrResult.success ? 'IoC esportati con successo' : qrResult.error || 'Errore');
          return;
        case 'elasticsearch':
          const esResult = await apiService.exportToElasticsearch(articleId);
          Alert.alert('Elasticsearch', esResult.success ? 'Articolo indicizzato' : esResult.error || 'Errore');
          return;
        default:
          return;
      }
      // Share file-like exports
      await Share.share({ message: shareContent, title: `${article.title} - ${format.toUpperCase()}` });
    } catch (error) {
      Alert.alert('Errore Export', error.message || 'Impossibile esportare');
    } finally {
      setExporting(null);
    }
  }, [articleId, article]);

  if (isLoading && !article) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.loadingText}>Articolo non trovato</Text>
      </View>
    );
  }

  const analysis = article.analysis;
  const hasAnalysis = article.status === 'analyzed' && analysis;

  const isCurrentlyAnalyzing = analyzing || autoAnalyzing;

  const tabs = [
    { id: 'summary', label: 'Riassunto', icon: 'document-text-outline' },
    { id: 'ioc', label: 'IoC', icon: 'bug-outline' },
    { id: 'techniques', label: 'MITRE', icon: 'git-network-outline' },
    { id: 'stix', label: 'STIX', icon: 'code-slash-outline' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.metaRow}>
          <Text style={styles.feedName}>{article.feed_name || article.feed_id}</Text>
          <Text style={styles.date}>{formatDate(article.published)}</Text>
        </View>

        <Text style={styles.title}>{article.title}</Text>

        {article.author ? (
          <Text style={styles.author}>di {article.author}</Text>
        ) : null}

        {/* Severity & Category */}
        {hasAnalysis && (
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badge,
                { backgroundColor: severityColor(analysis.severity) },
              ]}
            >
              <Ionicons name="warning-outline" size={12} color={colors.white} />
              <Text style={styles.badgeText}>
                {severityLabel(analysis.severity)}
              </Text>
            </View>
            <View
              style={[
                styles.badge,
                { backgroundColor: categoryColor(analysis.threat_category) },
              ]}
            >
              <Ionicons
                name={categoryIcon(analysis.threat_category)}
                size={12}
                color={colors.white}
              />
              <Text style={styles.badgeText}>
                {categoryLabel(analysis.threat_category)}
              </Text>
            </View>
            {analysis.confidence_score > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.surfaceLight }]}>
                <Text style={styles.badgeText}>
                  {Math.round(analysis.confidence_score * 100)}% confidenza
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          {/* Favorite button */}
          <TouchableOpacity
            style={[styles.iconButton, isFav && { backgroundColor: colors.warning + '30' }]}
            onPress={handleToggleFavorite}
          >
            <Ionicons
              name={isFav ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={isFav ? colors.warning : colors.primary}
            />
          </TouchableOpacity>

          {!hasAnalysis && (
            <TouchableOpacity
              style={styles.analyzeButton}
              onPress={handleAnalyze}
              disabled={isCurrentlyAnalyzing}
            >
              {isCurrentlyAnalyzing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="sparkles" size={16} color={colors.white} />
              )}
              <Text style={styles.analyzeButtonText}>
                {isCurrentlyAnalyzing ? 'Analisi in corso...' : 'Analizza con AI'}
              </Text>
            </TouchableOpacity>
          )}

          {hasAnalysis && (
            <TouchableOpacity
              style={styles.reportButton}
              onPress={handleGenerateReport}
              disabled={generatingReport}
            >
              {generatingReport ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="document-text" size={16} color={colors.white} />
              )}
              <Text style={styles.analyzeButtonText}>
                {generatingReport ? 'Generazione...' : 'Genera Report'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Action Items button */}
          <TouchableOpacity
            style={[styles.iconButton, showActions && { backgroundColor: colors.success + '30' }]}
            onPress={handleShowActions}
          >
            <Ionicons name="list-outline" size={20} color={showActions ? colors.success : colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => Linking.openURL(article.link)}
          >
            <Ionicons name="open-outline" size={20} color={colors.primary} />
          </TouchableOpacity>

          {hasAnalysis && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowExportMenu(!showExportMenu)}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="download-outline" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Exclude Source button */}
        <TouchableOpacity
          style={styles.excludeSourceBtn}
          onPress={handleExcludeSource}
        >
          <Ionicons name="eye-off-outline" size={14} color={colors.textMuted} />
          <Text style={styles.excludeSourceText}>
            Disabilita questa sorgente
          </Text>
        </TouchableOpacity>

        {/* Action Items Panel */}
        {showActions && (
          <View style={styles.actionsPanel}>
            <Text style={styles.actionsPanelTitle}>Cosa Fare</Text>
            {loadingActions ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              actionItems.map((item, i) => (
                <View key={i} style={[styles.actionItem, {
                  borderLeftColor: item.priority === 'critical' ? colors.critical
                    : item.priority === 'high' ? colors.error
                    : item.priority === 'medium' ? colors.warning
                    : colors.textMuted,
                }]}>
                  <Ionicons
                    name={item.icon || 'checkmark-circle'}
                    size={16}
                    color={item.priority === 'critical' ? colors.critical
                      : item.priority === 'high' ? colors.error
                      : item.priority === 'medium' ? colors.warning
                      : colors.success}
                  />
                  <Text style={styles.actionItemText}>{item.action}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Export Menu */}
        {showExportMenu && hasAnalysis && (
          <View style={styles.exportMenu}>
            <Text style={styles.exportMenuTitle}>Esporta come...</Text>
            {[
              { id: 'misp', label: 'MISP Event JSON', icon: 'shield-outline' },
              { id: 'yara', label: 'Regole YARA', icon: 'code-outline' },
              { id: 'sigma', label: 'Regole Sigma', icon: 'analytics-outline' },
              { id: 'thehive', label: 'Invia a TheHive', icon: 'send-outline' },
              { id: 'qradar', label: 'Invia a QRadar', icon: 'server-outline' },
              { id: 'elasticsearch', label: 'Invia a Elasticsearch', icon: 'cloud-upload-outline' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.exportMenuItem}
                onPress={() => handleExport(opt.id)}
                disabled={exporting === opt.id}
              >
                <Ionicons name={opt.icon} size={18} color={colors.primary} />
                <Text style={styles.exportMenuItemText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Tabs */}
      {hasAnalysis && (
        <>
          <View style={styles.tabRow}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  activeTab === tab.id && styles.tabActive,
                ]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={16}
                  color={
                    activeTab === tab.id ? colors.primary : colors.textMuted
                  }
                />
                <Text
                  style={[
                    styles.tabText,
                    activeTab === tab.id && styles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab Content */}
          {activeTab === 'summary' && (
            <SummaryTab analysis={analysis} article={article} />
          )}
          {activeTab === 'ioc' && <IocsTab analysis={analysis} />}
          {activeTab === 'techniques' && <TechniquesTab analysis={analysis} />}
          {activeTab === 'stix' && <StixViewer bundle={article.stix_bundle} />}
        </>
      )}

      {/* Contenuto originale se non analizzato */}
      {!hasAnalysis && (
        <View style={styles.section}>
          {isCurrentlyAnalyzing && (
            <View style={styles.autoAnalyzeBar}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.autoAnalyzeText}>
                Analisi AI in corso... Il riassunto apparirà automaticamente.
              </Text>
            </View>
          )}
          <Text style={styles.sectionTitle}>Contenuto</Text>
          <Text style={styles.contentText}>
            {article.content || article.summary || 'Nessun contenuto disponibile'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Tab Components ────────────────────────────────────────────────────────────

function SummaryTab({ analysis, article }) {
  // Counts for overview
  const iocCount = analysis.indicators?.length || 0;
  const cveCount = analysis.vulnerabilities?.length || 0;
  const techniqueCount = analysis.attack_techniques?.length || 0;
  const actorCount = analysis.threat_actors?.length || 0;
  const malwareCount = analysis.malware_families?.length || 0;

  return (
    <View>
      {/* Overview Card - key highlights at a glance */}
      <View style={styles.overviewCard}>
        <Text style={styles.overviewTitle}>Panoramica Articolo</Text>
        <View style={styles.overviewGrid}>
          {iocCount > 0 && (
            <View style={styles.overviewItem}>
              <Ionicons name="bug-outline" size={16} color={colors.warning} />
              <Text style={styles.overviewValue}>{iocCount}</Text>
              <Text style={styles.overviewLabel}>IoC</Text>
            </View>
          )}
          {cveCount > 0 && (
            <View style={styles.overviewItem}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.overviewValue}>{cveCount}</Text>
              <Text style={styles.overviewLabel}>CVE</Text>
            </View>
          )}
          {techniqueCount > 0 && (
            <View style={styles.overviewItem}>
              <Ionicons name="git-network-outline" size={16} color={colors.primary} />
              <Text style={styles.overviewValue}>{techniqueCount}</Text>
              <Text style={styles.overviewLabel}>MITRE</Text>
            </View>
          )}
          {actorCount > 0 && (
            <View style={styles.overviewItem}>
              <Ionicons name="skull-outline" size={16} color={colors.critical} />
              <Text style={styles.overviewValue}>{actorCount}</Text>
              <Text style={styles.overviewLabel}>Actor</Text>
            </View>
          )}
          {malwareCount > 0 && (
            <View style={styles.overviewItem}>
              <Ionicons name="warning-outline" size={16} color={colors.high} />
              <Text style={styles.overviewValue}>{malwareCount}</Text>
              <Text style={styles.overviewLabel}>Malware</Text>
            </View>
          )}
          {analysis.confidence_score > 0 && (
            <View style={styles.overviewItem}>
              <Ionicons name="analytics-outline" size={16} color={colors.success} />
              <Text style={styles.overviewValue}>{Math.round(analysis.confidence_score * 100)}%</Text>
              <Text style={styles.overviewLabel}>Confidenza</Text>
            </View>
          )}
        </View>
      </View>

      {/* Riassunto Italiano */}
      {analysis.summary_it ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🇮🇹 Riassunto</Text>
          <Text style={styles.summaryText}>{analysis.summary_it}</Text>
        </View>
      ) : null}

      {/* Riassunto Inglese */}
      {analysis.summary_en ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🇬🇧 Summary</Text>
          <Text style={styles.summaryText}>{analysis.summary_en}</Text>
        </View>
      ) : null}

      {/* Key Findings */}
      {analysis.key_findings?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Punti Chiave</Text>
          {analysis.key_findings.map((finding, i) => (
            <View key={i} style={styles.findingItem}>
              <View style={styles.findingBullet} />
              <Text style={styles.findingText}>{finding}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Threat Actors */}
      {analysis.threat_actors?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Threat Actor</Text>
          {analysis.threat_actors.map((ta, i) => (
            <View key={i} style={styles.threatActorCard}>
              <View style={styles.taHeader}>
                <Ionicons name="skull-outline" size={16} color={colors.critical} />
                <Text style={styles.taName}>{ta.name}</Text>
              </View>
              {ta.aliases?.length > 0 && (
                <Text style={styles.taDetail}>Alias: {ta.aliases.join(', ')}</Text>
              )}
              {ta.motivation && (
                <Text style={styles.taDetail}>Motivazione: {ta.motivation}</Text>
              )}
              {ta.country && (
                <Text style={styles.taDetail}>Origine: {ta.country}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Malware */}
      {analysis.malware_families?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Famiglie Malware</Text>
          <View style={styles.tagsWrap}>
            {analysis.malware_families.map((mw, i) => (
              <View key={i} style={styles.malwareTag}>
                <Ionicons name="bug-outline" size={12} color={colors.error} />
                <Text style={styles.malwareTagText}>{mw}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Raccomandazioni */}
      {analysis.recommendations?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Raccomandazioni</Text>
          {analysis.recommendations.map((rec, i) => (
            <View key={i} style={styles.recItem}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.recText}>{rec}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Settori colpiti */}
      {analysis.affected_sectors?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settori Colpiti</Text>
          <View style={styles.tagsWrap}>
            {analysis.affected_sectors.map((sector, i) => (
              <View
                key={i}
                style={[
                  styles.sectorTag,
                  { borderColor: categoryColor(sector) },
                ]}
              >
                <Ionicons
                  name={categoryIcon(sector)}
                  size={12}
                  color={categoryColor(sector)}
                />
                <Text style={styles.sectorTagText}>{categoryLabel(sector)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function IocsTab({ analysis }) {
  if (!analysis.indicators?.length && !analysis.vulnerabilities?.length) {
    return (
      <View style={styles.emptyTab}>
        <Ionicons name="search-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTabText}>Nessun indicatore di compromissione trovato</Text>
      </View>
    );
  }

  const iocIcons = {
    ip: 'globe-outline',
    domain: 'earth-outline',
    url: 'link-outline',
    email: 'mail-outline',
    hash_md5: 'finger-print-outline',
    hash_sha1: 'finger-print-outline',
    hash_sha256: 'finger-print-outline',
    filename: 'document-outline',
    cve: 'alert-circle-outline',
  };

  return (
    <View>
      {/* IoC */}
      {analysis.indicators?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Indicatori di Compromissione ({analysis.indicators.length})
          </Text>
          {analysis.indicators.map((ioc, i) => (
            <View key={i} style={styles.iocItem}>
              <View style={styles.iocHeader}>
                <Ionicons
                  name={iocIcons[ioc.type] || 'help-circle-outline'}
                  size={16}
                  color={colors.warning}
                />
                <Text style={styles.iocType}>{ioc.type.toUpperCase()}</Text>
              </View>
              <Text style={styles.iocValue} selectable>
                {ioc.value}
              </Text>
              {ioc.context ? (
                <Text style={styles.iocContext}>{ioc.context}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Vulnerabilità */}
      {analysis.vulnerabilities?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Vulnerabilità ({analysis.vulnerabilities.length})
          </Text>
          {analysis.vulnerabilities.map((vuln, i) => (
            <TouchableOpacity
              key={i}
              style={styles.vulnItem}
              onPress={() =>
                Linking.openURL(
                  `https://nvd.nist.gov/vuln/detail/${vuln.cve_id}`
                )
              }
            >
              <View style={styles.vulnHeader}>
                <Text style={styles.vulnCve}>{vuln.cve_id}</Text>
                {vuln.cvss_score != null && (
                  <View
                    style={[
                      styles.cvssBadge,
                      {
                        backgroundColor:
                          vuln.cvss_score >= 9
                            ? colors.critical
                            : vuln.cvss_score >= 7
                            ? colors.high
                            : vuln.cvss_score >= 4
                            ? colors.medium
                            : colors.low,
                      },
                    ]}
                  >
                    <Text style={styles.cvssText}>
                      CVSS {vuln.cvss_score}
                    </Text>
                  </View>
                )}
              </View>
              {vuln.description ? (
                <Text style={styles.vulnDesc}>{vuln.description}</Text>
              ) : null}
              {vuln.affected_products?.length > 0 && (
                <Text style={styles.vulnProducts}>
                  Prodotti: {vuln.affected_products.join(', ')}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function TechniquesTab({ analysis }) {
  if (!analysis.attack_techniques?.length) {
    return (
      <View style={styles.emptyTab}>
        <Ionicons name="git-network-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTabText}>
          Nessuna tecnica MITRE ATT&CK identificata
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Tecniche MITRE ATT&CK ({analysis.attack_techniques.length})
      </Text>
      {analysis.attack_techniques.map((tech, i) => (
        <TouchableOpacity
          key={i}
          style={styles.techniqueItem}
          onPress={() =>
            Linking.openURL(
              `https://attack.mitre.org/techniques/${tech.technique_id.replace(
                '.',
                '/'
              )}/`
            )
          }
        >
          <View style={styles.techHeader}>
            <View style={styles.techIdBadge}>
              <Text style={styles.techId}>{tech.technique_id}</Text>
            </View>
            <Text style={styles.techName}>{tech.technique_name}</Text>
          </View>
          {tech.tactic ? (
            <Text style={styles.techTactic}>Tattica: {tech.tactic}</Text>
          ) : null}
          {tech.description ? (
            <Text style={styles.techDesc}>{tech.description}</Text>
          ) : null}
          <View style={styles.techLinkRow}>
            <Ionicons name="open-outline" size={12} color={colors.primary} />
            <Text style={styles.techLink}>Vedi su MITRE ATT&CK</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  // Header
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  feedName: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 30,
    marginBottom: spacing.sm,
  },
  author: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.white,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  analyzeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  reportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  analyzeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Exclude Source
  excludeSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  excludeSourceText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  // Action Items Panel
  actionsPanel: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  actionsPanelTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingLeft: spacing.sm,
    borderLeftWidth: 3,
    paddingVertical: spacing.xs,
  },
  actionItemText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  tabActive: {
    backgroundColor: colors.surfaceLight,
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  // Sections
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 24,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
  },
  contentText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 24,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
  },
  // Findings
  findingItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'flex-start',
  },
  findingBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  findingText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  // Threat Actors
  threatActorCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.critical,
  },
  taHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  taName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  taDetail: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  // Tags
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  malwareTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  malwareTagText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  sectorTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  sectorTagText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  // Recommendations
  recItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  recText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  // IoC
  iocItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iocHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  iocType: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.warning,
  },
  iocValue: {
    fontSize: fontSize.md,
    color: colors.text,
    fontFamily: 'monospace',
  },
  iocContext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // Vulnerabilities
  vulnItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  vulnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  vulnCve: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'monospace',
  },
  cvssBadge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  cvssText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  vulnDesc: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  vulnProducts: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  // Techniques
  techniqueItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  techHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  techIdBadge: {
    backgroundColor: colors.primaryDark,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  techId: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
    fontFamily: 'monospace',
  },
  techName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  techTactic: {
    fontSize: fontSize.sm,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  techDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  techLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  techLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  // Empty tab
  emptyTab: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyTabText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // Export menu
  exportMenu: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceLight || '#f5f5f5',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  exportMenuTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  exportMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  exportMenuItemText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  // Overview Card
  overviewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  overviewTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  overviewItem: {
    alignItems: 'center',
    minWidth: 60,
    gap: spacing.xs,
  },
  overviewValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  overviewLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  // Auto-analyze banner
  autoAnalyzeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  autoAnalyzeText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
});
