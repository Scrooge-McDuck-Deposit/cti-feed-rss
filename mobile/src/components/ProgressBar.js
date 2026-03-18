/**
 * Barra di avanzamento animata per analisi articoli.
 * Mostra progresso, conteggio, percentuale, ETA e stato.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../theme';

function ProgressBar({
  progress = 0,
  total = 0,
  analyzed = 0,
  errors = 0,
  status = 'pending',
  startedAt = null,
  label = 'Analisi AI',
  onDismiss = null,
  compact = false,
}) {
  const animatedWidth = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const pct = total > 0 ? Math.min(progress / total, 1) : 0;
  const pctDisplay = Math.round(pct * 100);

  // Animate the progress bar width
  useEffect(() => {
    Animated.timing(animatedWidth, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  // Pulse animation when running
  useEffect(() => {
    if (status === 'running') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status]);

  // ETA calculation
  const etaText = (() => {
    if (status !== 'running' || !startedAt || progress < 1) return null;
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
    const avgPerItem = elapsed / progress;
    const remaining = (total - progress) * avgPerItem;
    if (remaining < 60) return `~${Math.ceil(remaining)}s rimanenti`;
    return `~${Math.ceil(remaining / 60)}min rimanenti`;
  })();

  const isComplete = status === 'completed';
  const isError = status === 'error';
  const isRunning = status === 'running' || status === 'pending';

  const barColor = isComplete ? colors.success : isError ? colors.error : colors.primary;
  const bgColor = isComplete ? colors.success + '15' : isError ? colors.error + '15' : colors.primary + '12';
  const iconName = isComplete ? 'checkmark-circle' : isError ? 'alert-circle' : 'sparkles';
  const iconColor = isComplete ? colors.success : isError ? colors.error : colors.primary;

  if (compact) {
    return (
      <View style={[compactStyles.container, { backgroundColor: bgColor }]}>
        <Animated.View style={[compactStyles.iconWrap, isRunning && { opacity: pulseAnim }]}>
          <Ionicons name={iconName} size={14} color={iconColor} />
        </Animated.View>
        <View style={compactStyles.barWrap}>
          <Animated.View
            style={[
              compactStyles.barFill,
              {
                backgroundColor: barColor,
                width: animatedWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={[compactStyles.text, { color: iconColor }]}>
          {pctDisplay}% ({progress}/{total})
        </Text>
        {onDismiss && isComplete && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Animated.View style={[styles.iconWrap, isRunning && { opacity: pulseAnim }]}>
          <Ionicons name={iconName} size={18} color={iconColor} />
        </Animated.View>
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: iconColor }]}>{label}</Text>
          <Text style={styles.sublabel}>
            {isComplete
              ? `Completata — ${analyzed} analizzati${errors > 0 ? `, ${errors} errori` : ''}`
              : isError
              ? `Errore — ${analyzed} analizzati, ${errors} errori`
              : `${progress} di ${total} articoli`}
          </Text>
        </View>
        <Text style={[styles.pctText, { color: iconColor }]}>{pctDisplay}%</Text>
        {onDismiss && (isComplete || isError) && (
          <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.barBackground}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: barColor,
              width: animatedWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
        {/* Error segment */}
        {errors > 0 && total > 0 && (
          <View
            style={[
              styles.barError,
              { width: `${(errors / total) * 100}%`, left: `${(analyzed / total) * 100}%` },
            ]}
          />
        )}
      </View>

      {/* Footer */}
      {isRunning && etaText && (
        <Text style={styles.etaText}>{etaText}</Text>
      )}
    </View>
  );
}

export default React.memo(ProgressBar);

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    marginRight: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  sublabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  pctText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
  dismissBtn: {
    marginLeft: spacing.sm,
  },
  barBackground: {
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barError: {
    position: 'absolute',
    height: '100%',
    backgroundColor: colors.error,
    borderRadius: 3,
  },
  etaText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
});

const compactStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  iconWrap: {},
  barWrap: {
    flex: 1,
    height: 4,
    backgroundColor: colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'right',
  },
});
