import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { DISTRICT_NAMES, districtName, stateName } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Props = {
  visible: boolean;
  state: string;
  selected: string | null;
  onSelect: (district: string) => void;
  onClose: () => void;
};

// Full-screen list of the chosen state's districts (from the backend) with a search box.
// Karnataka's districts are written in English or Kannada; the others in English.
export function DistrictPicker({ visible, state, selected, onSelect, onClose }: Props) {
  const { t, language } = useApp();
  const [search, setSearch] = useState('');
  // The list is kept with the state it belongs to, so a list for another state is never shown
  const [loaded, setLoaded] = useState<{ state: string; districts: string[] | null } | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let current = true;
    api<string[]>(`/location/districts?state=${encodeURIComponent(state)}`)
      .then((list) => current && setLoaded({ state, districts: list }))
      .catch(() => current && setLoaded({ state, districts: null }));
    return () => {
      current = false;
    };
  }, [visible, state]);

  const ready = loaded?.state === state ? loaded : null;
  const failed = ready !== null && ready.districts === null;

  const query = search.trim().toLowerCase();
  const districts = (ready?.districts ?? [])
    .filter((key) => {
      const names = DISTRICT_NAMES[key];
      return !query || key.toLowerCase().includes(query) || names?.en.toLowerCase().includes(query) || names?.kn.includes(search.trim());
    })
    .sort((a, b) => districtName(a, language).localeCompare(districtName(b, language)));

  function choose(district: string) {
    setSearch('');
    onSelect(district);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexShrink: 1, gap: 2 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{t.chooseDistrict}</Text>
              <Text style={{ fontSize: 15, color: colors.muted }}>{stateName(state, language)}</Text>
            </View>
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

        {!ready && <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />}
        {failed && (
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.danger, paddingHorizontal: 20 }}>{t.placesListError}</Text>
        )}

        <FlatList
          data={districts}
          keyExtractor={(key) => key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}
          ListEmptyComponent={
            ready?.districts ? (
              <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center', padding: 20 }}>
                {t.noDistrictMatch}
              </Text>
            ) : null
          }
          renderItem={({ item: key }) => {
            const isSelected = key === selected;
            const names = DISTRICT_NAMES[key];
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
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{districtName(key, language)}</Text>
                {names && <Text style={{ fontSize: 14, color: colors.muted }}>{language === 'en' ? names.kn : names.en}</Text>}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
