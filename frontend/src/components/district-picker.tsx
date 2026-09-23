import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { useApp } from '@/lib/app-context';
import { DISTRICT_NAMES } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Props = {
  visible: boolean;
  selected: string | null;
  onSelect: (district: string) => void;
  onClose: () => void;
};

// Full-screen list of Karnataka districts with a search box.
// Search matches both the English and the Kannada name.
export function DistrictPicker({ visible, selected, onSelect, onClose }: Props) {
  const { t, language } = useApp();
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const districts = Object.entries(DISTRICT_NAMES)
    .filter(([, names]) => !query || names.en.toLowerCase().includes(query) || names.kn.includes(search.trim()))
    .sort((a, b) => a[1][language].localeCompare(b[1][language]));

  function choose(district: string) {
    setSearch('');
    onSelect(district);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{t.chooseDistrict}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.close}</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.searchDistrict}
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

        <FlatList
          data={districts}
          keyExtractor={([key]) => key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={
            <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center', padding: 20 }}>
              {t.noDistrictMatch}
            </Text>
          }
          renderItem={({ item: [key, names] }) => {
            const isSelected = key === selected;
            return (
              <Pressable
                onPress={() => choose(key)}
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
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{names[language]}</Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>{language === 'en' ? names.kn : names.en}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
