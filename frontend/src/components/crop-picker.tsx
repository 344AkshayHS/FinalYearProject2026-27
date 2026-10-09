import { useState } from 'react';
import { Modal, Pressable, SectionList, TextInput, View } from 'react-native';

import { CropThumb } from '@/components/crop-photo';
import { KeyboardView } from '@/components/keyboard-view';
import { Text } from '@/components/text';
import { useApp } from '@/lib/app-context';
import { inputFontSize } from '@/lib/text-size';
import { suggestedCrops } from '@/lib/crops';
import { cropName } from '@/lib/translations';
import { colors, radius } from '@/theme';

type Props = {
  visible: boolean;
  chosen: string[]; // crops already in the table: shown ticked
  onSelect: (crop: string) => void;
  onClose: () => void;
};

// Full-screen list to add a crop to the compare table: the last result's crops and the saved crops first,
// then every crop, with a search box (English or Kannada names)
export function CropPicker({ visible, chosen, onSelect, onClose }: Props) {
  const { t, language, crops, lastResult, textSize } = useApp();
  const [search, setSearch] = useState('');

  const all = crops && crops !== 'failed' ? crops.list.map((item) => item.crop) : [];
  const saved = crops && crops !== 'failed' ? crops.saved.map((item) => item.crop) : [];
  const suggested = suggestedCrops(lastResult, saved);
  const byName = (a: string, b: string) => cropName(a, language).localeCompare(cropName(b, language));

  const query = search.trim().toLowerCase();
  // Empty groups are left out, so a search that finds nothing shows "No crop with that name"
  const sections = (
    query
    ? [
        {
          title: t.compare.all,
          data: all
            .filter((crop) => crop.includes(query) || cropName(crop, 'kn').includes(search.trim()))
            .sort(byName),
        },
      ]
    : [
        { title: t.compare.fromResult, data: suggested.fromResult },
        { title: t.compare.saved, data: suggested.saved },
        { title: t.compare.all, data: [...all].sort(byName) },
      ]
  ).filter((section) => section.data.length > 0);

  function choose(crop: string) {
    setSearch('');
    onSelect(crop);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* The keyboard for the search box does not hide the end of the list */}
      <KeyboardView offset={0}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{t.compare.add}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>{t.close}</Text>
              </Pressable>
            </View>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.compare.search}
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={{
                minHeight: 48,
                paddingHorizontal: 16,
                fontSize: inputFontSize(textSize),
                color: colors.text,
                backgroundColor: colors.card,
                borderRadius: radius.small,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            />
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(crop, i) => crop + i}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 8 }}
            ListEmptyComponent={
              <Text style={{ fontSize: 16, color: colors.muted, textAlign: 'center', padding: 20 }}>{t.compare.noMatch}</Text>
            }
            renderSectionHeader={({ section }) => (
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary, paddingTop: 12 }}>{section.title}</Text>
            )}
            renderItem={({ item: crop }) => {
              const isChosen = chosen.includes(crop);
              return (
                <Pressable
                  onPress={() => choose(crop)}
                  disabled={isChosen}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isChosen }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    borderRadius: radius.medium,
                    borderCurve: 'continuous',
                    backgroundColor: isChosen ? colors.primarySoft : colors.card,
                    borderWidth: 1,
                    borderColor: isChosen ? colors.primary : colors.border,
                    opacity: pressed ? 0.7 : 1,
                  })}>
                  <CropThumb crop={crop} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{cropName(crop, language)}</Text>
                    <Text style={{ fontSize: 14, color: colors.muted }}>{cropName(crop, language === 'en' ? 'kn' : 'en')}</Text>
                  </View>
                  {isChosen && <Text style={{ fontSize: 18, color: colors.primary }}>✓</Text>}
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardView>
    </Modal>
  );
}
