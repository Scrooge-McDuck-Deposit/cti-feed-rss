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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../store/ArticleStore';
import apiService from '../services/api';
import cacheService from '../services/cacheService';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatBytes } from '../utils/helpers';
import ProgressBar from '../components/ProgressBar';

export default function SettingsScreen() {
  const {
    settings, updateSettings, feeds, aiStatus, aiConfig,
    loadAiStatus, loadAiConfig, updateAiConfig, testAiConnection, importOpml,
    excludedSources, loadExcludedSources, reenableSource,
    createDemoArticle, startBatchAnalysis, batchAnalysisTask, dismissBatchAnalysis,
  } = useStore();
  const [apiUrl, setApiUrl] = useState(settings.apiUrl);
  const [cacheInfo, setCacheInfo] = useState(null);
  const [opmlUrl, setOpmlUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // AI config local state
  const [selectedEngine, setSelectedEngine] = useState('ollama');
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o');
  const [savingAi, setSavingAi] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [checkingVersions, setCheckingVersions] = useState(false);
  const [versionResults, setVersionResults] = useState(null);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [startingBatch, setStartingBatch] = useState(false);

  useEffect(() => {
    loadCacheInfo();
    loadAiStatus();
    loadAiConfig().then(() => {
      // Sync local state once config is loaded
    });
  }, []);

  // Sync local AI state when aiConfig loads from backend
  useEffect(() => {
    if (aiConfig) {
      setSelectedEngine(aiConfig.engine || 'ollama');
      if (aiConfig.ollama_base_url) setOllamaUrl(aiConfig.ollama_base_url);
      if (aiConfig.ollama_model) setOllamaModel(aiConfig.ollama_model);
      if (aiConfig.gemini_model) setGeminiModel(aiConfig.gemini_model);
      if (aiConfig.openai_model) setOpenaiModel(aiConfig.openai_model);
      // Keys are not returned from backend for security; keep local state
    }
  }, [aiConfig]);

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

  const handleSaveAiConfig = useCallback(async () => {
    setSavingAi(true);
    try {
      const config = { engine: selectedEngine };
      if (selectedEngine === 'ollama') {
        config.ollama_base_url = ollamaUrl;
        config.ollama_model = ollamaModel;
      } else if (selectedEngine === 'gemini') {
        config.gemini_model = geminiModel;
        if (geminiKey) config.gemini_api_key = geminiKey;
      } else if (selectedEngine === 'openai') {
        config.openai_model = openaiModel;
        if (openaiKey) config.openai_api_key = openaiKey;
      }
      await updateAiConfig(config);
      Alert.alert('Salvato', 'Configurazione AI aggiornata');
    } catch (error) {
      Alert.alert('Errore', error.message || 'Impossibile salvare la configurazione');
    } finally {
      setSavingAi(false);
    }
  }, [selectedEngine, ollamaUrl, ollamaModel, geminiKey, geminiModel, openaiKey, openaiModel]);

  const handleTestAi = useCallback(async () => {
    setTestingAi(true);
    try {
      const result = await testAiConnection();
      Alert.alert(
        result.success ? 'Connessione riuscita' : 'Connessione fallita',
        result.message,
      );
    } catch (error) {
      Alert.alert('Errore', error.message || 'Test fallito');
    } finally {
      setTestingAi(false);
    }
  }, []);

  const handleCheckVersions = useCallback(async () => {
    setCheckingVersions(true);
    setVersionResults(null);
    try {
      const result = await apiService.checkVersions();
      setVersionResults(result);
    } catch (error) {
      Alert.alert('Errore', error.message || 'Impossibile verificare le versioni');
    } finally {
      setCheckingVersions(false);
    }
  }, []);

  const handleCreateDemo = useCallback(async () => {
    setCreatingDemo(true);
    try {
      const article = await createDemoArticle();
      Alert.alert(
        'Articolo Demo Creato',
        `"${article.title}" è stato creato con analisi completa. Cercalo nella lista articoli per esplorare tutte le funzionalità dell'app.`
      );
    } catch (error) {
      Alert.alert('Errore', error.message || 'Impossibile creare l\'articolo demo');
    } finally {
      setCreatingDemo(false);
    }
  }, []);

  const handleBatchAnalysis = useCallback(async () => {
    setStartingBatch(true);
    try {
      const result = await startBatchAnalysis(null, 5);
      Alert.alert(
        'Analisi Avviata',
        `Analisi batch avviata per ${result.total} articoli. Il progresso è visibile nella dashboard.`
      );
    } catch (error) {
      Alert.alert('Errore', error.message || 'Impossibile avviare l\'analisi batch');
    } finally {
      setStartingBatch(false);
    }
  }, []);

  const handleReenableSource = useCallback(async (feedId, feedName) => {
    Alert.alert(
      'Riabilita Sorgente',
      `Vuoi riabilitare "${feedName}"?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Riabilita',
          onPress: async () => {
            try {
              await reenableSource(feedId);
              Alert.alert('Fatto', 'Sorgente riabilitata');
            } catch (error) {
              Alert.alert('Errore', error.message || 'Impossibile riabilitare');
            }
          },
        },
      ]
    );
  }, []);

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

      {/* AI Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Intelligenza Artificiale</Text>

        {/* Status indicator */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Stato AI</Text>
            <Text style={styles.settingHint}>
              {aiStatus?.available
                ? `${aiStatus.engine_label || aiStatus.engine} — ${aiStatus.model}`
                : 'Non configurato (analisi base attiva)'}
            </Text>
          </View>
          <View style={[
            styles.statusDot,
            { backgroundColor: aiStatus?.available ? colors.success : colors.warning }
          ]} />
        </View>

        {/* Engine selector */}
        <Text style={styles.fieldLabel}>Motore AI</Text>
        <View style={styles.engineSelector}>
          {[
            { id: 'ollama', label: 'Ollama', desc: 'Locale, gratuito', icon: 'hardware-chip-outline' },
            { id: 'gemini', label: 'Gemini', desc: 'Google, gratis con limiti', icon: 'sparkles-outline' },
            { id: 'openai', label: 'OpenAI', desc: 'A pagamento', icon: 'key-outline' },
          ].map((eng) => (
            <TouchableOpacity
              key={eng.id}
              style={[
                styles.engineOption,
                selectedEngine === eng.id && styles.engineOptionActive,
              ]}
              onPress={() => setSelectedEngine(eng.id)}
            >
              <Ionicons
                name={eng.icon}
                size={20}
                color={selectedEngine === eng.id ? colors.primary : colors.textMuted}
              />
              <Text style={[
                styles.engineLabel,
                selectedEngine === eng.id && styles.engineLabelActive,
              ]}>
                {eng.label}
              </Text>
              <Text style={styles.engineDesc}>{eng.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ollama settings */}
        {selectedEngine === 'ollama' && (
          <View style={styles.engineConfig}>
            <Text style={styles.fieldLabel}>URL Ollama</Text>
            <TextInput
              style={styles.input}
              value={ollamaUrl}
              onChangeText={setOllamaUrl}
              placeholder="http://localhost:11434"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldLabel}>Modello</Text>
            <TextInput
              style={styles.input}
              value={ollamaModel}
              onChangeText={setOllamaModel}
              placeholder="llama3"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Installa Ollama da ollama.com, poi esegui: ollama pull {ollamaModel}
            </Text>
          </View>
        )}

        {/* Gemini settings */}
        {selectedEngine === 'gemini' && (
          <View style={styles.engineConfig}>
            <Text style={styles.fieldLabel}>API Key</Text>
            <TextInput
              style={styles.input}
              value={geminiKey}
              onChangeText={setGeminiKey}
              placeholder={aiConfig?.gemini_api_key_set ? '••••••••  (già configurata)' : 'Inserisci la tua API key'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.fieldLabel}>Modello</Text>
            <TextInput
              style={styles.input}
              value={geminiModel}
              onChangeText={setGeminiModel}
              placeholder="gemini-2.0-flash"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Ottieni una API key gratuita su aistudio.google.com/apikey
            </Text>
          </View>
        )}

        {/* OpenAI settings */}
        {selectedEngine === 'openai' && (
          <View style={styles.engineConfig}>
            <Text style={styles.fieldLabel}>API Key</Text>
            <TextInput
              style={styles.input}
              value={openaiKey}
              onChangeText={setOpenaiKey}
              placeholder={aiConfig?.openai_api_key_set ? '••••••••  (già configurata)' : 'sk-...'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.fieldLabel}>Modello</Text>
            <TextInput
              style={styles.input}
              value={openaiModel}
              onChangeText={setOpenaiModel}
              placeholder="gpt-4o"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Richiede un account OpenAI con credito. Modelli: gpt-4o, gpt-4o-mini
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.aiActions}>
          <TouchableOpacity
            style={[styles.aiSaveButton, savingAi && { opacity: 0.6 }]}
            onPress={handleSaveAiConfig}
            disabled={savingAi}
          >
            {savingAi ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="save-outline" size={18} color={colors.white} />
            )}
            <Text style={styles.aiSaveButtonText}>
              {savingAi ? 'Salvataggio...' : 'Salva Configurazione'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.aiTestButton, testingAi && { opacity: 0.6 }]}
            onPress={handleTestAi}
            disabled={testingAi}
          >
            {testingAi ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
            )}
            <Text style={styles.aiTestButtonText}>
              {testingAi ? 'Test...' : 'Testa Connessione'}
            </Text>
          </TouchableOpacity>
        </View>
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

      {/* Excluded Sources */}
      {excludedSources.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sorgenti Disabilitate</Text>
          <Text style={styles.hint}>
            Queste sorgenti sono state disabilitate e i loro articoli non vengono mostrati.
          </Text>
          {excludedSources.map((src) => (
            <View key={src.feed_id} style={styles.excludedSourceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.excludedSourceName}>{src.name}</Text>
                {src.language ? (
                  <Text style={styles.excludedSourceLang}>
                    {src.language === 'it' ? '🇮🇹' : '🌍'} {src.language.toUpperCase()}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.reenableButton}
                onPress={() => handleReenableSource(src.feed_id, src.name)}
              >
                <Ionicons name="eye-outline" size={16} color={colors.success} />
                <Text style={styles.reenableButtonText}>Riabilita</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Analisi & Demo */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Strumenti</Text>

        {/* Batch Analysis */}
        <TouchableOpacity
          style={[styles.toolButton, startingBatch && { opacity: 0.6 }]}
          onPress={handleBatchAnalysis}
          disabled={startingBatch}
        >
          {startingBatch ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.toolButtonTitle}>
              {startingBatch ? 'Avvio in corso...' : 'Analisi Batch AI'}
            </Text>
            <Text style={styles.toolButtonDesc}>
              Analizza automaticamente tutti gli articoli in attesa (a batch di 5)
            </Text>
          </View>
        </TouchableOpacity>

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

        {/* Demo Article */}
        <TouchableOpacity
          style={[styles.toolButton, creatingDemo && { opacity: 0.6 }]}
          onPress={handleCreateDemo}
          disabled={creatingDemo}
        >
          {creatingDemo ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="school-outline" size={18} color={colors.accent} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.toolButtonTitle}>
              {creatingDemo ? 'Creazione...' : 'Crea Articolo Demo'}
            </Text>
            <Text style={styles.toolButtonDesc}>
              Genera un articolo di esempio con analisi completa per esplorare tutte le funzionalità
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informazioni</Text>

        {/* Version Check */}
        <TouchableOpacity
          style={[styles.versionCheckButton, checkingVersions && { opacity: 0.6 }]}
          onPress={handleCheckVersions}
          disabled={checkingVersions}
        >
          {checkingVersions ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={18} color={colors.primary} />
          )}
          <Text style={styles.versionCheckText}>
            {checkingVersions ? 'Verifica in corso...' : 'Verifica aggiornamenti componenti'}
          </Text>
        </TouchableOpacity>

        {versionResults && (
          <View style={styles.versionResults}>
            <View style={styles.versionHeader}>
              <Ionicons
                name={versionResults.all_up_to_date ? 'checkmark-circle' : 'warning'}
                size={18}
                color={versionResults.all_up_to_date ? colors.success : colors.warning}
              />
              <Text style={[styles.versionHeaderText, {
                color: versionResults.all_up_to_date ? colors.success : colors.warning
              }]}>
                {versionResults.all_up_to_date
                  ? 'Tutti i componenti sono aggiornati'
                  : 'Alcuni componenti hanno aggiornamenti disponibili'}
              </Text>
            </View>
            <Text style={styles.versionPython}>Python {versionResults.python_version}</Text>
            {versionResults.components.map((comp) => (
              <View key={comp.package} style={styles.versionRow}>
                <Ionicons
                  name={comp.up_to_date === true ? 'checkmark-circle' : comp.up_to_date === false ? 'arrow-up-circle' : 'help-circle-outline'}
                  size={14}
                  color={comp.up_to_date === true ? colors.success : comp.up_to_date === false ? colors.warning : colors.textMuted}
                />
                <Text style={styles.versionPkg}>{comp.package}</Text>
                <Text style={styles.versionInstalled}>{comp.installed || '?'}</Text>
                {comp.up_to_date === false && (
                  <Text style={styles.versionLatest}> → {comp.latest}</Text>
                )}
              </View>
            ))}
          </View>
        )}

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
  // AI Configuration
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  engineSelector: {
    gap: spacing.sm,
  },
  engineOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  engineOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  engineLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  engineLabelActive: {
    color: colors.primary,
  },
  engineDesc: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'right',
  },
  engineConfig: {
    marginTop: spacing.sm,
  },
  aiActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  aiSaveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  aiSaveButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  aiTestButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  aiTestButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  versionCheckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  versionCheckText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '500',
  },
  versionResults: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  versionHeaderText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  versionPython: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  versionPkg: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  versionInstalled: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  versionLatest: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  // Excluded sources
  excludedSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  excludedSourceName: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
  },
  excludedSourceLang: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  reenableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success + '20',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  reenableButtonText: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '600',
  },
  // Tools section
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  toolButtonTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  toolButtonDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
});
