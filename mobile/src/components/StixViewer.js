/**
 * Visualizzatore STIX bundle con elenco oggetti e vista JSON.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../theme';

const STIX_ICONS = {
  'threat-actor': 'skull-outline',
  malware: 'bug-outline',
  indicator: 'analytics-outline',
  'attack-pattern': 'flash-outline',
  vulnerability: 'warning-outline',
  relationship: 'git-network-outline',
  report: 'document-text-outline',
  identity: 'person-outline',
  note: 'create-outline',
};

function StixObjectCard({ obj }) {
  const [expanded, setExpanded] = useState(false);
  const icon = STIX_ICONS[obj.type] || 'cube-outline';

  return (
    <TouchableOpacity
      style={styles.objectCard}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
    >
      <View style={styles.objectHeader}>
        <View style={styles.objectTitle}>
          <Ionicons name={icon} size={16} color={colors.primary} />
          <Text style={styles.objectType}>{obj.type}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </View>
      {obj.name && <Text style={styles.objectName}>{obj.name}</Text>}
      {expanded && (
        <ScrollView horizontal style={styles.jsonContainer}>
          <Text style={styles.jsonText}>
            {JSON.stringify(obj, null, 2)}
          </Text>
        </ScrollView>
      )}
    </TouchableOpacity>
  );
}

export default function StixViewer({ bundle }) {
  const [showJson, setShowJson] = useState(false);

  if (!bundle || !bundle.objects) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
        <Text style={styles.emptyText}>Nessun bundle STIX disponibile</Text>
      </View>
    );
  }

  const objects = bundle.objects || [];
  const typeCounts = {};
  objects.forEach((o) => {
    typeCounts[o.type] = (typeCounts[o.type] || 0) + 1;
  });

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <Text style={styles.statsLabel}>
          {objects.length} oggetti STIX 2.1
        </Text>
        <TouchableOpacity onPress={() => setShowJson(!showJson)}>
          <Text style={styles.toggleJson}>
            {showJson ? 'Vista Oggetti' : 'Vista JSON'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Type summary */}
      <View style={styles.typeSummary}>
        {Object.entries(typeCounts).map(([type, count]) => (
          <View key={type} style={styles.typeChip}>
            <Ionicons
              name={STIX_ICONS[type] || 'cube-outline'}
              size={12}
              color={colors.primary}
            />
            <Text style={styles.typeChipText}>
              {type} ({count})
            </Text>
          </View>
        ))}
      </View>

      {/* Content */}
      {showJson ? (
        <ScrollView horizontal style={styles.fullJson}>
          <Text style={styles.jsonText}>
            {JSON.stringify(bundle, null, 2)}
          </Text>
        </ScrollView>
      ) : (
        objects.map((obj, i) => <StixObjectCard key={obj.id || i} obj={obj} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  toggleJson: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  typeSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  typeChipText: {
    color: colors.primary,
    fontSize: fontSize.xs,
  },
  objectCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  objectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  objectTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  objectType: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  objectName: {
    color: colors.text,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  jsonContainer: {
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    maxHeight: 250,
  },
  fullJson: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    maxHeight: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jsonText: {
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    color: colors.accent,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
