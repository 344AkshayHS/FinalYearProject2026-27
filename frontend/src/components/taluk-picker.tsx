import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { districtName, talukName } from '@/lib/translations';
import { colors, radius } from '@/theme';

export type Taluk = { key: string; name: string };

type Props = {
  visible: boolean;
  district: string;
  selected: Taluk | null;
  onSelect: (taluk: Taluk | null) => void; // null = the whole district
  onClose: () => void;
};

// List of the chosen Karnataka district's taluks, with "Whole district" first.
// Choosing a taluk is optional: without one the whole district is checked.
export function TalukPicker({ visible, district, selected, onSelect, onClose }: Props) {
  const { t, language } = useApp();
  // The list is kept with the district it belongs to, so a list for another district is never shown
  const [loaded, setLoaded] = useState<{ district: string; taluks: Taluk[] | null } | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let current = true;
    api<Taluk[]>(`/location/taluks?district=${encodeURIComponent(district)}`)
      .then((list) => current && setLoaded({ district, taluks: list }))
      .catch(() => current && setLoaded({ district, taluks: null }));
    return () => {
      current = false;
    };
  }, [visible, district]);

  const ready = loaded?.district === district ? loaded : null;
  const taluks = ready?.taluks ?? null;
  const failed = ready !== null && ready.taluks === null;

  const options: (Taluk | null)[] = [null, ...(taluks ?? [])];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: 20, gap: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{t.chooseTaluk}</Text>
            <Text style={{ fontSize: 15, color: colors.muted }}>{districtName(district, language)}</Text>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.close}</Text>
          </Pressable>
        </View>

        {!taluks && !failed && <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />}
        {failed && (
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.danger, paddingHorizontal: 20 }}>{t.talukListError}</Text>
        )}

        <FlatList
          data={taluks ? options : [null]}
          keyExtractor={(item) => item?.key ?? 'whole-district'}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}
          renderItem={({ item }) => {
            const isSelected = (item?.key ?? null) === (selected?.key ?? null);
            return (
              <Pressable
                onPress={() => onSelect(item)}
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
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
                  {item ? talukName(item.name) : t.wholeDistrict}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
