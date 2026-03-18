/**
 * Schermata Watchlist — gestione asset monitorati e visualizzazione alert.
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
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import useStore from '../store/ArticleStore';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { severityColor } from '../theme';
import { timeAgo } from '../utils/helpers';

const ASSET_TYPES = [
  { id: 'ip', label: 'IP', icon: 'globe-outline' },
  { id: 'domain', label: 'Dominio', icon: 'earth-outline' },
  { id: 'hash', label: 'Hash', icon: 'finger-print-outline' },
  { id: 'cve', label: 'CVE', icon: 'bug-outline' },
  { id: 'keyword', label: 'Keyword', icon: 'text-outline' },
  { id: 'email', label: 'Email', icon: 'mail-outline' },
  { id: 'url', label: 'URL', icon: 'link-outline' },
];

export default function WatchlistScreen({ navigation }) {
  const {
    watchlist,
    watchlistAlerts,
    watchlistAlertsCount,
    isRefreshing,
    loadWatchlist,
    addWatchlistAsset,
    removeWatchlistAsset,
    toggleWatchlistAsset,
    loadWatchlistAlerts,
  } = useStore();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState('ip');
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [activeTab, setActiveTab] = useState('assets'); // 'assets' | 'alerts'

  useEffect(() => {
    loadWatchlist();
    loadWatchlistAlerts();
  }, []);

  const onRefresh = useCallback(async () => {
    await loadWatchlist();
    await loadWatchlistAlerts();
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newValue.trim()) {
      Alert.alert('Errore', 'Il valore non può essere vuoto');
      return;
    }
    await addWatchlistAsset(newType, newValue.trim(), newLabel.trim() || undefined);
    setNewValue('');
    setNewLabel('');
    setShowAddForm(false);
    await loadWatchlistAlerts();
  }, [newType, newValue, newLabel, addWatchlistAsset, loadWatchlistAlerts]);

  const handleRemove = useCallback(async (assetId) => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-restricted-globals
      if (confirm('Rimuovere questo asset dalla watchlist?')) {
        await removeWatchlistAsset(assetId);
      }
    } else {
      Alert.alert(
        'Conferma',
        'Rimuovere questo asset dalla watchlist?',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Rimuovi', style: 'destructive', onPress: () => removeWatchlistAsset(assetId) },
        ]
      );
    }
  }, [removeWatchlistAsset]);

  const handleToggle = useCallback(async (assetId) => {
    await toggleWatchlistAsset(assetId);
  }, [toggleWatchlistAsset]);

  const handleAlertPress = useCallback((alert) => {
    navigation.navigate('Feed', {
      screen: 'ArticleDetail',
      params: { articleId: alert.article?.id, title: alert.article?.title },
    });
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Watchlist</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddForm(!showAddForm)}
        >
          <Ionicons name={showAddForm ? 'close' : 'add'} size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'assets' && styles.tabActive]}
          onPress={() => setActiveTab('assets')}
        >
          <Ionicons name="shield-outline" size={16} color={activeTab === 'assets' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'assets' && styles.tabTextActive]}>
            Asset ({watchlist.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'alerts' && styles.tabActive]}
          onPress={() => setActiveTab('alerts')}
        >
          <Ionicons name="notifications-outline" size={16} color={activeTab === 'alerts' ? colors.primary : colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'alerts' && styles.tabTextActive]}>
            Alert ({watchlistAlertsCount})
          </Text>
        </TouchableOpacity>
      </View>

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
        {/* Add Form */}
        {showAddForm && (
          <View style={styles.addForm}>
            <Text style={styles.addFormTitle}>Aggiungi Asset</Text>

            {/* Type Selector */}
            <Text style={styles.fieldLabel}>Tipo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {ASSET_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.typeChip,
                    newType === t.id && styles.typeChipActive,
                  ]}
                  onPress={() => setNewType(t.id)}
                >
                  <Ionicons
                    name={t.icon}
                    size={14}
                    color={newType === t.id ? colors.white : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.typeChipText,
                      newType === t.id && styles.typeChipTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Value Input */}
            <Text style={styles.fieldLabel}>Valore *</Text>
            <TextInput
              style={styles.input}
              placeholder={_placeholder(newType)}
              placeholderTextColor={colors.textMuted}
              value={newValue}
              onChangeText={setNewValue}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Label Input */}
            <Text style={styles.fieldLabel}>Etichetta (opzionale)</Text>
            <TextInput
              style={styles.input}
              placeholder="es. Server produzione"
              placeholderTextColor={colors.textMuted}
              value={newLabel}
              onChangeText={setNewLabel}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAdd}>
              <Ionicons name="add-circle-outline" size={18} color={colors.white} />
              <Text style={styles.submitBtnText}>Aggiungi alla Watchlist</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Assets Tab */}
        {activeTab === 'assets' && (
          <View>
            {watchlist.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="shield-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyText}>Nessun asset monitorato</Text>
                <Text style={styles.emptySubText}>
                  Aggiungi IP, hash, CVE o keyword per monitorarli
                </Text>
              </View>
            ) : (
              watchlist.map((asset) => (
                <View key={asset.id} style={styles.assetCard}>
                  <View style={styles.assetRow}>
                    <TouchableOpacity
                      style={[styles.toggleBtn, !asset.enabled && styles.toggleBtnOff]}
                      onPress={() => handleToggle(asset.id)}
                    >
                      <Ionicons
                        name={asset.enabled ? 'eye' : 'eye-off'}
                        size={16}
                        color={asset.enabled ? colors.success : colors.textMuted}
                      />
                    </TouchableOpacity>
                    <View style={styles.assetInfo}>
                      <View style={styles.assetTopRow}>
                        <View style={styles.assetTypeBadge}>
                          <Text style={styles.assetTypeText}>{asset.asset_type.toUpperCase()}</Text>
                        </View>
                        {asset.label && <Text style={styles.assetLabel}>{asset.label}</Text>}
                      </View>
                      <Text style={styles.assetValue}>{asset.value}</Text>
                      <Text style={styles.assetMeta}>
                        {asset.match_count || 0} match · Aggiunto {timeAgo(asset.created_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleRemove(asset.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <View>
            {watchlistAlerts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
                <Text style={styles.emptyText}>Nessun alert</Text>
                <Text style={styles.emptySubText}>
                  Non ci sono match con i tuoi asset monitorati
                </Text>
              </View>
            ) : (
              watchlistAlerts.map((alert, idx) => (
                <TouchableOpacity
                  key={`${alert.asset?.id}-${alert.article?.id || idx}`}
                  style={styles.alertCard}
                  onPress={() => handleAlertPress(alert)}
                >
                  <View style={styles.alertHeader}>
                    <View style={styles.assetTypeBadge}>
                      <Text style={styles.assetTypeText}>
                        {(alert.asset?.asset_type || '').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.alertAssetValue} numberOfLines={1}>
                      {alert.asset?.value}
                    </Text>
                    <View
                      style={[
                        styles.alertScoreBadge,
                        { backgroundColor: _alertScoreColor(alert.relevance_score) },
                      ]}
                    >
                      <Text style={styles.alertScoreText}>
                        {Math.round((alert.relevance_score || 0) * 100)}%
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.alertTitle} numberOfLines={2}>
                    {alert.article?.title}
                  </Text>
                  {alert.matched_in && (
                    <Text style={styles.alertMatch}>
                      Match in: {alert.matched_in}
                    </Text>
                  )}
                  <View style={styles.alertFooter}>
                    <View
                      style={[
                        styles.severityBadge,
                        { backgroundColor: severityColor(alert.article?.analysis?.severity || 'informational') },
                      ]}
                    >
                      <Text style={styles.severityBadgeText}>
                        {(alert.article?.analysis?.severity || 'info').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.alertFeed}>
                      {alert.article?.feed_name || alert.article?.feed_id || ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function _placeholder(type) {
  const map = {
    ip: 'es. 192.168.1.1',
    domain: 'es. example.com',
    hash: 'es. a1b2c3d4e5f6...',
    cve: 'es. CVE-2024-1234',
    keyword: 'es. ransomware',
    email: 'es. admin@example.com',
    url: 'es. https://malicious.site/path',
  };
  return map[type] || 'Inserisci valore';
}

function _alertScoreColor(score) {
  if (score >= 0.8) return colors.critical;
  if (score >= 0.5) return colors.warning;
  return colors.textMuted;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.background,
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  // Add Form
  addForm: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  addFormTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  typeScroll: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeChipText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.white,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: fontSize.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  submitBtnText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: fontSize.md,
  },
  // Empty State
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  // Asset Card
  assetCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.success + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtnOff: {
    backgroundColor: colors.textMuted + '20',
  },
  assetInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  assetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assetTypeBadge: {
    backgroundColor: colors.primary + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  assetTypeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  assetLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  assetValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  assetMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Alert Card
  alertCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.critical + '30',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  alertAssetValue: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  alertScoreBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    minWidth: 40,
    alignItems: 'center',
  },
  alertScoreText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.white,
  },
  alertTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  alertMatch: {
    fontSize: fontSize.xs,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  alertFeed: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
