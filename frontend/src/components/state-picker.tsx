import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { stateName } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Props = {
  visible: boolean;
  selected: string | null;
  onSelect: (state: string) => void;
  onClose: () => void;
};

// Full-screen list of the states and union territories of India (from the backend) with a search box.
// Search matches both the English and the Kannada name.
export function StatePicker({ visible, selected, onSelect, onClose }: Props) {
  const { t, language } = useApp();
  const [search, setSearch] = useState('');
  const [states, setStates] = useState<string[] | null | 'failed'>(null);

  // Loaded the first time the list opens, and again if that failed
  useEffect(() => {
    if (!visible || Array.isArray(states)) {
      return;
    }
    api<string[]>('/location/states')
      .then(setStates)
      .catch(() => setStates('failed'));
  }, [visible, states]);

  const query = search.trim().toLowerCase();
  const list = (Array.isArray(states) ? states : [])
    .filter((name) => !query || name.toLowerCase().includes(query) || stateName(name, 'kn').includes(search.trim()))
    .sort((a, b) => stateName(a, language).localeCompare(stateName(b, language)));

  function choose(state: string) {
    setSearch('');
    onSelect(state);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{t.chooseState}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.close}</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.searchState}
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={{
              minHeight: 48,
              paddingHorizontal: 16,
              fontSize: 17,
              color: colors.text,
              backgroundColor: colors.card,
              borderRadius: radius.small,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        </View>

        {states === null && <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />}
        {states === 'failed' && (
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.danger, paddingHorizontal: 20 }}>{t.placesListError}</Text>
        )}

        <FlatList
          data={list}
          keyExtractor={(name) => name}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={
            Array.isArray(states) ? (
              <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center', padding: 20 }}>{t.noStateMatch}</Text>
            ) : null
          }
          renderItem={({ item: name }) => {
            const isSelected = name === selected;
            return (
              <Pressable
                onPress={() => choose(name)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => ({
                  padding: 16,
                  borderRadius: radius.medium,
                  borderCurve: 'continuous',
                  backgroundColor: isSelected ? colors.primarySoft : colors.card,
                  borderWidth: isSelected ? 1.5 : 1,
                  borderColor: isSelected ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{stateName(name, language)}</Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>{language === 'en' ? stateName(name, 'kn') : name}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
