/**
 * Schermata Impostazioni.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../store/ArticleStore';
import cacheService from '../services/cacheService';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatBytes } from '../utils/helpers';

export default function SettingsScreen() {
  const { settings, updateSettings, feeds, aiStatus, loadAiStatus, importOpml } = useStore();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [opmlUrl, setOpmlUrl] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadCacheInfo();
    loadAiStatus();
  }, []);

  const loadCacheInfo = async () => {
    const info = await cacheService.getCacheSize();
    setCacheInfo(info);
  };

  const handleSaveUrl = useCallback(() => {
    if (!apiUrl.trim()) {
      Alert.alert('Errore', 'Inserisci un URL valido');
      return;
    }
    updateSettings({ apiUrl: apiUrl.trim() });
    Alert.alert('Salvato', 'URL del backend aggiornato');
  }, [apiUrl]);

  const handleClearCache = useCallback(async () => {
    Alert.alert(
      'Svuota Cache',
      'Sei sicuro di voler eliminare tutti i dati in cache?',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Svuota',
          style: 'destructive',
          onPress: async () => {
            await cacheService.clearAll();
            await loadCacheInfo();
            Alert.alert('Fatto', 'Cache svuotata con successo');
          },
        },
      ]
    );
  }, []);

  const handleImportOpml = useCallback(async () => {
    const url = opmlUrl.trim();
    if (!url) {
      Alert.alert('Errore', 'Inserisci un URL OPML valido');
      return;
    }
    setImporting(true);
    try {
      const result = await importOpml(url);
      Alert.alert(
        'Importazione completata',
        `Importati ${result.imported || 0} feed da OPML`
      );
      setOpmlUrl('');
    } catch (error) {
      Alert.alert('Errore', error.message || 'Importazione fallita');
    } finally {
      setImporting(false);
    }
  }, [opmlUrl]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Server */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server Backend</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://localhost:8000/api/v1"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveUrl}>
            <Ionicons name="checkmark" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          URL del server backend FastAPI
        </Text>
      </View>

      {/* Preferenze */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferenze</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Analisi automatica</Text>
            <Text style={styles.settingHint}>
              Analizza automaticamente i nuovi articoli
            </Text>
          </View>
          <Switch
            value={settings.autoAnalyze}
            onValueChange={(value) => updateSettings({ autoAnalyze: value })}
            trackColor={{ false: colors.surfaceLight, true: colors.primary + '80' }}
            thumbColor={settings.autoAnalyze ? colors.primary : colors.textMuted}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Lingua report</Text>
            <Text style={styles.settingHint}>
              {settings.language === 'it' ? 'Italiano' : 'Inglese'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.langButton}
            onPress={() =>
              updateSettings({
                language: settings.language === 'it' ? 'en' : 'it',
              })
            }
          >
            <Text style={styles.langButtonText}>
              {settings.language === 'it' ? '🇮🇹 IT' : '🇬🇧 EN'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Cache */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cache Locale</Text>

        <View style={styles.cacheStats}>
          <View style={styles.cacheStat}>
            <Text style={styles.cacheStatValue}>
              {cacheInfo?.items || 0}
            </Text>
            <Text style={styles.cacheStatLabel}>Elementi</Text>
          </View>
          <View style={styles.cacheStat}>
            <Text style={styles.cacheStatValue}>
              {cacheInfo ? formatBytes(cacheInfo.sizeBytes) : '0 B'}
            </Text>
            <Text style={styles.cacheStatLabel}>Dimensione</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleClearCache}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={styles.dangerButtonText}>Svuota cache locale</Text>
        </TouchableOpacity>
      </View>

      {/* AI Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Intelligenza Artificiale</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Stato AI</Text>
            <Text style={styles.settingHint}>
              {aiStatus?.available
                ? `${aiStatus.engine_label || aiStatus.engine} — ${aiStatus.model}`
                : aiStatus?.message || 'Verifica in corso...'}
            </Text>
          </View>
          <View style={[
            styles.statusDot,
            { backgroundColor: aiStatus?.available ? colors.success : colors.warning }
          ]} />
        </View>
        {!aiStatus?.available && (
          <Text style={styles.hint}>
            L'app funziona senza AI con categorizzazione base ed estrazione IoC regex. Per abilitare l'AI configura AI_ENGINE nel backend: Ollama (gratis, locale), Gemini (gratis con limiti), o OpenAI (a pagamento).
          </Text>
        )}
      </View>

      {/* OPML Import */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Importa Feed OPML</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={opmlUrl}
            onChangeText={setOpmlUrl}
            placeholder="https://example.com/feeds.opml"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.saveButton, importing && { opacity: 0.5 }]}
            onPress={handleImportOpml}
            disabled={importing}
          >
            <Ionicons name="cloud-download-outline" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Importa feed da un file OPML remoto (URL diretto al file .opml)
        </Text>
      </View>

      {/* Feed Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feed Configurati</Text>
        <Text style={styles.feedCount}>
          {feeds.length} feed CTI configurati
        </Text>

        <View style={styles.feedCategories}>
          {[
            { label: 'Italiani', count: feeds.filter((f) => f.language === 'it').length, icon: '🇮🇹' },
            { label: 'Internazionali', count: feeds.filter((f) => f.language === 'en').length, icon: '🌍' },
            { label: 'Governativi', count: feeds.filter((f) => f.category === 'government').length, icon: '🏛️' },
            { label: 'Threat Intel', count: feeds.filter((f) => f.category === 'threat_intel').length, icon: '🔍' },
            { label: 'Vulnerabilità', count: feeds.filter((f) => f.category === 'vulnerability').length, icon: '🛡️' },
          ].map((cat) => (
            <View key={cat.label} style={styles.feedCatRow}>
              <Text style={styles.feedCatIcon}>{cat.icon}</Text>
              <Text style={styles.feedCatLabel}>{cat.label}</Text>
              <Text style={styles.feedCatCount}>{cat.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informazioni</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Versione</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Motore AI</Text>
          <Text style={styles.infoValue}>
            {aiStatus?.available
              ? `${aiStatus.engine_label} (${aiStatus.model})`
              : 'Non configurato'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>STIX</Text>
          <Text style={styles.infoValue}>v2.1</Text>
        </View>
      </View>
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
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  settingHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  langButton: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  langButtonText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cacheStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cacheStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  cacheStatValue: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  cacheStatLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  dangerButtonText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '500',
  },
  feedCount: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  feedCategories: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  feedCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  feedCatIcon: {
    fontSize: fontSize.lg,
    width: 28,
    textAlign: 'center',
  },
  feedCatLabel: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
  },
  feedCatCount: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  infoLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
});
