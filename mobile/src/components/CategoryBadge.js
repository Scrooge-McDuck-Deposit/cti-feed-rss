/**
 * Badge per la categoria con opzione rimozione.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { categoryColor } from '../theme';
import { categoryLabel, categoryIcon } from '../utils/helpers';

export default function CategoryBadge({ category, onRemove, size = 'md' }) {
  const color = categoryColor(category);
  const isSmall = size === 'sm';

  const content = (
    <View
      style={[
        styles.badge,
        isSmall && styles.badgeSmall,
        { backgroundColor: color + '20', borderColor: color + '40' },
      ]}
    >
      <Ionicons
        name={categoryIcon(category)}
        size={isSmall ? 10 : 14}
        color={color}
      />
      <Text
        style={[
          styles.text,
          isSmall && styles.textSmall,
          { color },
        ]}
      >
        {categoryLabel(category)}
      </Text>
      {onRemove && (
        <Ionicons name="close" size={14} color={color} />
      )}
    </View>
  );

  if (onRemove) {
    return (
      <TouchableOpacity onPress={onRemove}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  badgeSmall: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  textSmall: {
    fontSize: fontSize.xs,
  },
});
