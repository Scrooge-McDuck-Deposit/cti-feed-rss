/**
 * Schermata Feed - lista articoli con filtri e ricerca.
 */

import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useStore from '../store/ArticleStore';
import ArticleCard from '../components/ArticleCard';
import CategoryBadge from '../components/CategoryBadge';
import { colors, spacing, fontSize, borderRadius } from '../theme';

export default function FeedScreen({ navigation, route }) {
  const {
    articles,
    isLoading,
    isRefreshing,
    hasMore,
    filters,
    categories,
    feeds,
    loadArticles,
    loadMoreArticles,
    refreshArticles,
    setFilter,
    clearFilters,
  } = useStore();

  const [searchText, setSearchText] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Gestisci parametri da navigazione (es. click su categoria dalla dashboard)
  useEffect(() => {
    if (route.params?.category) {
      setFilter('category', route.params.category);
    }
  }, [route.params?.category]);

  const handleSearch = useCallback(() => {
    setFilter('search', searchText);
  }, [searchText]);

  const handleArticlePress = useCallback(
    (article) => {
      navigation.navigate('ArticleDetail', {
        articleId: article.id,
        title: article.title,
      });
    },
    [navigation]
  );

  const renderArticle = useCallback(
    ({ item }) => <ArticleCard article={item} onPress={() => handleArticlePress(item)} />,
    [handleArticlePress]
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="newspaper-outline" size={64} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>Nessun articolo trovato</Text>
        <Text style={styles.emptySubtitle}>
          Prova a modificare i filtri o a sincronizzare i feed
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={refreshArticles}>
          <Ionicons name="sync-outline" size={18} color={colors.white} />
          <Text style={styles.emptyButtonText}>Sincronizza Feed</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const activeFiltersCount = [
    filters.category,
    filters.severity,
    filters.feedId,
  ].filter(Boolean).length;

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca articoli..."
            placeholderTextColor={colors.textMuted}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchText('');
                setFilter('search', '');
              }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.filterButton,
            activeFiltersCount > 0 && styles.filterButtonActive,
          ]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons
            name="filter"
            size={18}
            color={activeFiltersCount > 0 ? colors.white : colors.textSecondary}
          />
          {activeFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active Filters */}
      {activeFiltersCount > 0 && (
        <View style={styles.activeFilters}>
          {filters.category && (
            <CategoryBadge
              category={filters.category}
              onRemove={() => setFilter('category', null)}
            />
          )}
          {filters.severity && (
            <TouchableOpacity
              style={styles.activeFilterChip}
              onPress={() => setFilter('severity', null)}
            >
              <Text style={styles.activeFilterText}>
                Severità: {filters.severity}
              </Text>
              <Ionicons name="close" size={14} color={colors.text} />
            </TouchableOpacity>
          )}
          {filters.feedId && (
            <TouchableOpacity
              style={styles.activeFilterChip}
              onPress={() => setFilter('feedId', null)}
            >
              <Text style={styles.activeFilterText}>
                Feed: {feeds.find((f) => f.id === filters.feedId)?.name || filters.feedId}
              </Text>
              <Ionicons name="close" size={14} color={colors.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearFiltersText}>Pulisci tutto</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Articles List */}
      <FlatList
        data={articles}
        renderItem={renderArticle}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshArticles}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReached={loadMoreArticles}
        onEndReachedThreshold={0.3}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />

      {/* Filter Modal */}
      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        categories={categories}
        feeds={feeds}
        filters={filters}
        setFilter={setFilter}
        clearFilters={clearFilters}
      />
    </View>
  );
}

function FilterModal({
  visible,
  onClose,
  categories,
  feeds,
  filters,
  setFilter,
  clearFilters,
}) {
  const severities = ['critical', 'high', 'medium', 'low', 'informational'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Filtri</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Categorie */}
          <Text style={styles.filterSectionTitle}>Categoria</Text>
          <View style={styles.filterOptions}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.filterOption,
                  filters.category === cat.id && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setFilter(
                    'category',
                    filters.category === cat.id ? null : cat.id
                  );
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    filters.category === cat.id && styles.filterOptionTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Severità */}
          <Text style={styles.filterSectionTitle}>Severità</Text>
          <View style={styles.filterOptions}>
            {severities.map((sev) => (
              <TouchableOpacity
                key={sev}
                style={[
                  styles.filterOption,
                  filters.severity === sev && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setFilter('severity', filters.severity === sev ? null : sev);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    filters.severity === sev && styles.filterOptionTextActive,
                  ]}
                >
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Feed */}
          <Text style={styles.filterSectionTitle}>Feed</Text>
          <View style={styles.filterOptions}>
            {feeds.slice(0, 12).map((feed) => (
              <TouchableOpacity
                key={feed.id}
                style={[
                  styles.filterOption,
                  filters.feedId === feed.id && styles.filterOptionActive,
                ]}
                onPress={() => {
                  setFilter('feedId', filters.feedId === feed.id ? null : feed.id);
                }}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    filters.feedId === feed.id && styles.filterOptionTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {feed.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Azioni */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                clearFilters();
                onClose();
              }}
            >
              <Text style={styles.clearButtonText}>Pulisci filtri</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={onClose}>
              <Text style={styles.applyButtonText}>Applica</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: fontSize.md,
    color: colors.text,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.critical,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  activeFilterText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  clearFiltersText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  listContent: {
    padding: spacing.md,
    paddingTop: 0,
  },
  footer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
  },
  emptyButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  filterSectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterOptionText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  filterOptionTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xxl,
  },
  clearButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  applyButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.white,
  },
});
