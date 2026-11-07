import { useNativeTheme } from '@/hooks/use-native-theme';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  Canvas,
  Fill,
  ImageFormat,
  Path as SkiaPath,
  Skia,
  type SkPath,
  useCanvasRef,
} from '@shopify/react-native-skia';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getStroke } from 'perfect-freehand';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/contexts/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  createFormSubmission,
  fetchCompanySettings,
  fetchFormContextPreview,
  fetchFormSubmissions,
  fetchFormTemplates,
  reopenFormSubmissionForEdit,
  updateFormSubmission,
  type FormField,
  type FormContextPreview,
  type FormTemplate,
  type MobileCompanySettings,
  type TimesheetWorkerEntry,
} from '@/lib/forms-service';

const LINE = '#dce4f0';
const TEXT = '#182641';
const MUTED = '#74819a';
const BLUE_SOFT = '#edf3ff';
const BLUE_BORDER = '#cddcff';
const BLUE_TEXT = '#2f62e6';
const BRAND_RED = '#CC0000';
const AMBER_SOFT = '#fff4e6';
const AMBER_BORDER = '#f0d5a2';
const AMBER_TEXT = '#c78518';

type SignaturePoint = { x: number; y: number };
type SignatureStroke = SignaturePoint[];
type SignatureValue = {
  type: 'signature-image';
  dataUrl: string;
  trimmed?: boolean;
  capturedAt: string;
};

function isEmpty(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

type ResourceUsageRow = {
  type: string;
  slotId?: string;
  equipmentId?: string;
  materialId?: string;
  estimatedQuantity?: number;
  actualQuantity?: number;
};

type ResourceCatalogItem = {
  id: string;
  type: string;
  label: string;
  estimatedQuantity?: number;
  archived?: boolean;
};

function ResourceCatalogPicker({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: ResourceCatalogItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { themeColor } = useNativeTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item.id} ${item.label} ${item.type}`.toLowerCase().includes(query),
    );
  }, [items, search]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end bg-black/40"
      >
        <View
          className="max-h-[75%] rounded-t-3xl bg-white dark:bg-slate-800 px-4 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-[#182641] dark:text-[#f1f5f9]">
              {title}
            </Text>
            <Pressable onPress={onClose} className="p-2">
              <Ionicons name="close" size={24} color={themeColor(MUTED)} />
            </Pressable>
          </View>
          <View className="mt-3 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3">
            <Ionicons name="search" size={19} color={themeColor(MUTED)} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by ID or name..."
              className="flex-1 px-3 py-3 text-sm text-slate-900 dark:text-slate-100"
              autoFocus
            />
          </View>
          <ScrollView
            className="mt-3"
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {filtered.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item.id)}
                className={`mb-2 flex-row items-center rounded-xl border px-3 py-3 ${selectedId === item.id ? 'border-blue-300 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554]' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}
              >
                <View className="flex-1">
                  <Text className="font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                    {item.label}
                  </Text>
                  <Text className="mt-0.5 text-xs text-[#74819a] dark:text-[#94a3b8]">
                    {item.type}
                  </Text>
                </View>
                <Ionicons
                  name={
                    selectedId === item.id
                      ? 'checkmark-circle'
                      : 'chevron-forward'
                  }
                  size={21}
                  color={themeColor(selectedId === item.id ? '#16a34a' : MUTED)}
                />
              </Pressable>
            ))}
            {filtered.length === 0 ? (
              <Text className="py-8 text-center text-sm text-[#74819a] dark:text-[#94a3b8]">
                No matching resources found.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ResourceTypePicker({
  visible,
  title,
  types,
  accentColor,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  types: string[];
  accentColor: string;
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  const { themeColor } = useNativeTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="max-h-[70%] rounded-t-3xl bg-white dark:bg-slate-800 px-4 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-[#182641] dark:text-[#f1f5f9]">
              {title}
            </Text>
            <Pressable onPress={onClose} className="p-2">
              <Ionicons name="close" size={24} color={themeColor(MUTED)} />
            </Pressable>
          </View>
          <Text className="mt-1 text-sm text-[#74819a] dark:text-[#94a3b8]">
            Select the type of block you want to add.
          </Text>
          <ScrollView
            className="mt-4"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {types.map((type) => (
              <Pressable
                key={type}
                onPress={() => onSelect(type)}
                className="mb-2 flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4"
              >
                <View className="flex-1">
                  <Text className="font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                    {type}
                  </Text>
                </View>
                <Ionicons
                  name="add-circle"
                  size={23}
                  color={themeColor(accentColor)}
                />
              </Pressable>
            ))}
            {types.length === 0 ? (
              <Text className="py-8 text-center text-sm text-[#74819a] dark:text-[#94a3b8]">
                No additional types are available.
              </Text>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function normalizedResourceType(value: string) {
  return value.trim().toLocaleLowerCase();
}

function uniqueResourceTypes(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizedResourceType(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function RoleResourceUsageField({
  plans,
  equipmentUsage,
  materialUsage,
  onEquipmentChange,
  onMaterialChange,
  disabled,
}: {
  plans: NonNullable<FormContextPreview['resourcePlans']>;
  equipmentUsage: ResourceUsageRow[];
  materialUsage: ResourceUsageRow[];
  onEquipmentChange: (rows: ResourceUsageRow[]) => void;
  onMaterialChange: (rows: ResourceUsageRow[]) => void;
  disabled: boolean;
}) {
  const { themeColor } = useNativeTheme();
  const [picker, setPicker] = useState<null | {
    kind: 'equipment' | 'material';
    row: ResourceUsageRow;
    title: string;
    items: ResourceCatalogItem[];
  }>(null);
  const [typePicker, setTypePicker] = useState<null | 'equipment' | 'material'>(
    null,
  );
  const equipmentGroups = useMemo(() => {
    const plannedTypes = new Set(
      plans.equipment.map((group) => normalizedResourceType(group.type)),
    );
    const addedTypes = uniqueResourceTypes(
      equipmentUsage
        .map((row) => row.type)
        .filter(
          (type) =>
            !type.startsWith('__') &&
            !plannedTypes.has(normalizedResourceType(type)),
        ),
    );
    return [
      ...plans.equipment,
      ...addedTypes.map((type) => ({
        type,
        estimatedQuantity: 0,
        items: plans.additionalEquipment.filter(
          (item) =>
            normalizedResourceType(item.type) === normalizedResourceType(type),
        ),
      })),
    ];
  }, [equipmentUsage, plans.additionalEquipment, plans.equipment]);
  const materialGroups = useMemo(() => {
    const plannedTypes = new Set(
      plans.materials.map((group) => normalizedResourceType(group.type)),
    );
    const addedTypes = uniqueResourceTypes(
      materialUsage
        .map((row) => row.type)
        .filter(
          (type) =>
            !type.startsWith('__') &&
            !plannedTypes.has(normalizedResourceType(type)),
        ),
    );
    return [
      ...plans.materials,
      ...addedTypes.map((type) => ({
        type,
        estimatedQuantity: 0,
        items: plans.additionalMaterials.filter(
          (item) =>
            normalizedResourceType(item.type) === normalizedResourceType(type),
        ),
      })),
    ].map((group) => ({
      ...group,
      items: [
        ...group.items,
        ...(plans.archivedMaterials || []).filter((item) =>
          normalizedResourceType(item.type) === normalizedResourceType(group.type) &&
          materialUsage.some((row) => row.materialId === item.id) &&
          !group.items.some((existing) => existing.id === item.id),
        ),
      ],
    }));
  }, [materialUsage, plans.additionalMaterials, plans.materials, plans.archivedMaterials]);
  const availableEquipmentTypes = useMemo(() => {
    const visibleTypes = new Set(
      equipmentGroups.map((group) => normalizedResourceType(group.type)),
    );
    return uniqueResourceTypes(
      plans.additionalEquipment.map((item) => item.type),
    ).filter((type) => !visibleTypes.has(normalizedResourceType(type)));
  }, [equipmentGroups, plans.additionalEquipment]);
  const availableMaterialTypes = useMemo(() => {
    const visibleTypes = new Set(
      materialGroups.map((group) => normalizedResourceType(group.type)),
    );
    return uniqueResourceTypes([
      ...plans.additionalMaterialTypes,
      ...plans.additionalMaterials.map((item) => item.type),
    ]).filter((type) => !visibleTypes.has(normalizedResourceType(type)));
  }, [
    materialGroups,
    plans.additionalMaterialTypes,
    plans.additionalMaterials,
  ]);

  return (
    <Card>
      <Text className="text-[13px] leading-5 text-[#74819a] dark:text-[#94a3b8]">
        Enter the equipment IDs and material quantities actually used on this
        shift.
      </Text>
      {equipmentGroups.length > 0 ? (
        <View className="mt-4 flex-row items-center gap-3">
          <View className="rounded-xl bg-blue-100 dark:bg-[#172554] p-2">
            <Ionicons
              name="bus-outline"
              size={20}
              color={themeColor(BLUE_TEXT)}
            />
          </View>
          <View className="flex-1">
            <Text className="text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]">
              EQUIPMENT USED
            </Text>
            <Text className="text-xs text-[#74819a] dark:text-[#94a3b8]">
              Select the equipment IDs used. You can add more if needed.
            </Text>
          </View>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={themeColor(BLUE_TEXT)}
          />
        </View>
      ) : null}
      {equipmentGroups.map((group) => (
        <View
          key={`equipment-${group.type}`}
          className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
        >
          <View className="flex-row items-center gap-3">
            <View className="rounded-xl bg-emerald-500 p-2">
              <Ionicons name="swap-horizontal" size={20} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                {group.type}
              </Text>
              <Text className="text-xs text-[#74819a] dark:text-[#94a3b8]">
                {group.estimatedQuantity > 0 ? (
                  <>
                    Expected Qty:{' '}
                    <Text className="text-[#2f62e6] dark:text-[#93c5fd]">
                      {group.estimatedQuantity}
                    </Text>
                  </>
                ) : (
                  'Additional equipment'
                )}
              </Text>
              {group.items.length === 0 ? (
                <Text className="mt-1 text-xs font-bold text-[#CC0000] dark:text-red-400">
                  No active equipment IDs match this type.
                </Text>
              ) : null}
            </View>
            <Text className="w-20 text-center text-[9px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
              Equipment ID
            </Text>
            <Text className="w-9 text-center text-[9px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
              Used
            </Text>
          </View>
          {equipmentUsage
            .filter((row) => row.type === group.type)
            .map((row, index) => {
              const slotKey = row.slotId || `${group.type}-${index}`;
              const selectedItem = group.items.find(
                (item) => item.id === row.equipmentId,
              );
              return (
                <View key={slotKey} className="mt-2">
                  <View className="flex-row items-center gap-2">
                    <Text className="w-6 text-center text-sm font-bold text-[#182641] dark:text-[#f1f5f9]">
                      {index + 1}
                    </Text>
                    <Pressable
                      disabled={disabled}
                      onPress={() =>
                        setPicker({
                          kind: 'equipment',
                          row,
                          title: `Select ${group.type}`,
                          items: group.items.filter(
                            (item) =>
                              !equipmentUsage.some(
                                (used) =>
                                  used.equipmentId === item.id && used !== row,
                              ),
                          ),
                        })
                      }
                      className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3"
                    >
                      <Text
                        className="font-bold"
                        style={{
                          color: themeColor(
                            selectedItem ? TEXT : MUTED,
                            'text',
                          ),
                        }}
                      >
                        {selectedItem?.label || 'Select Equipment ID'}
                      </Text>
                    </Pressable>
                    <Ionicons
                      name={
                        row.equipmentId ? 'checkmark-circle' : 'ellipse-outline'
                      }
                      size={24}
                      color={themeColor(row.equipmentId ? '#16a34a' : MUTED)}
                    />
                    <Pressable
                      disabled={disabled}
                      onPress={() =>
                        onEquipmentChange(
                          equipmentUsage.filter((item) => item !== row),
                        )
                      }
                    >
                      <Ionicons
                        name="trash-outline"
                        size={22}
                        color={BRAND_RED}
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          {!disabled ? (
            <Pressable
              onPress={() =>
                onEquipmentChange([
                  ...equipmentUsage,
                  { type: group.type, slotId: `${group.type}-${Date.now()}` },
                ])
              }
              className="mt-3 items-center rounded-xl border border-blue-100 dark:border-[#1e40af] px-3 py-3"
            >
              <Text className="font-bold text-[#2f62e6] dark:text-[#93c5fd]">
                ＋ Add Another {group.type}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {!disabled ? (
        <Pressable
          disabled={availableEquipmentTypes.length === 0}
          onPress={() => setTypePicker('equipment')}
          className="mt-4 items-center rounded-xl border border-blue-200 dark:border-[#1e40af] px-3 py-4 disabled:opacity-40"
        >
          <Text className="font-extrabold text-[#2f62e6] dark:text-[#93c5fd]">
            ＋ Add Equipment Type
          </Text>
        </Pressable>
      ) : null}
      {materialGroups.length > 0 ? (
        <View className="mt-5">
          <View className="flex-row items-center gap-3 border-b border-slate-200 dark:border-slate-700 p-3">
            <View className="rounded-xl bg-purple-100 dark:bg-[#3b0764] p-2">
              <Ionicons
                name="cube-outline"
                size={20}
                color={themeColor('#7c3aed')}
              />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                MATERIALS USED
              </Text>
              <Text className="text-xs text-[#74819a] dark:text-[#94a3b8]">
                Select the material IDs used. You can add more if needed.
              </Text>
            </View>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={themeColor('#7c3aed')}
            />
          </View>
          {materialGroups.map((group) => (
            <View
              key={`material-group-${group.type}`}
              className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
            >
              <View className="flex-row items-center gap-3">
                <View className="rounded-xl bg-purple-100 dark:bg-[#3b0764] p-2">
                  <Ionicons
                    name="cube-outline"
                    size={20}
                    color={themeColor('#7c3aed')}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                    {group.type}
                  </Text>
                  {group.items.length === 0 ? (
                    <Text className="mt-1 text-xs font-bold text-[#CC0000] dark:text-red-400">
                      No active material IDs match this type.
                    </Text>
                  ) : null}
                </View>
                {group.estimatedQuantity > 0 ? (
                  <View className="items-center">
                    <Text className="text-[9px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
                      Estimated
                    </Text>
                    <Text className="text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                      {group.estimatedQuantity}
                    </Text>
                  </View>
                ) : (
                  <Text className="text-[10px] font-extrabold uppercase text-[#7c3aed] dark:text-[#c4b5fd]">
                    Additional
                  </Text>
                )}
              </View>
              <View className="mt-3 flex-row items-center justify-between">
                <View>
                  <Text className="text-xs font-extrabold text-[#7c3aed] dark:text-[#c4b5fd]">
                    Materials Used (
                    {
                      materialUsage.filter((row) => row.type === group.type)
                        .length
                    }
                    )
                  </Text>
                  <Text className="mt-0.5 text-xs font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                    Total Used:{' '}
                    {materialUsage
                      .filter((row) => row.type === group.type)
                      .reduce(
                        (total, row) =>
                          total + Math.max(0, Number(row.actualQuantity) || 0),
                        0,
                      )}
                  </Text>
                </View>
                {group.estimatedQuantity > 0 &&
                materialUsage
                  .filter((row) => row.type === group.type)
                  .reduce(
                    (total, row) =>
                      total + Math.max(0, Number(row.actualQuantity) || 0),
                    0,
                  ) === group.estimatedQuantity ? (
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs font-extrabold text-[#16a34a] dark:text-[#86efac]">
                      Matches estimate
                    </Text>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={themeColor('#16a34a')}
                    />
                  </View>
                ) : null}
              </View>
              {materialUsage
                .filter((row) => row.type === group.type)
                .map((row, index) => {
                  const slotKey =
                    row.slotId || `${group.type}-material-${index}`;
                  const selectedItem = group.items.find(
                    (item) => item.id === row.materialId,
                  );
                  const actualQuantity = Math.max(
                    0,
                    Number(row.actualQuantity) || 0,
                  );
                  return (
                    <View key={slotKey} className="mt-2">
                      <View className="flex-row items-center gap-2">
                        <Text className="w-6 text-center text-sm font-bold text-[#182641] dark:text-[#f1f5f9]">
                          {index + 1}
                        </Text>
                        <Pressable
                          disabled={disabled}
                          onPress={() =>
                            setPicker({
                              kind: 'material',
                              row,
                              title: `Select ${group.type}`,
                              items: group.items.filter(
                                (item) =>
                                  !item.archived &&
                                  !materialUsage.some(
                                    (used) =>
                                      used.materialId === item.id &&
                                      used !== row,
                                  ),
                              ),
                            })
                          }
                          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3"
                        >
                          <Text
                            className="font-bold"
                            style={{
                              color: themeColor(
                                selectedItem ? TEXT : MUTED,
                                'text',
                              ),
                            }}
                          >
                            {selectedItem?.label || 'Select Material ID'}
                          </Text>
                        </Pressable>
                        <Ionicons
                          name={
                            row.materialId
                              ? 'checkmark-circle'
                              : 'ellipse-outline'
                          }
                          size={24}
                          color={themeColor(row.materialId ? '#16a34a' : MUTED)}
                        />
                        <Pressable
                          disabled={disabled}
                          onPress={() =>
                            onMaterialChange(
                              materialUsage.filter((item) => item !== row),
                            )
                          }
                        >
                          <Ionicons
                            name="trash-outline"
                            size={22}
                            color={BRAND_RED}
                          />
                        </Pressable>
                      </View>
                      <View className="mt-2 flex-row items-center justify-end gap-3">
                        <Text className="text-xs font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
                          Actual Qty Used
                        </Text>
                        <View className="flex-row overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                          <Pressable
                            disabled={disabled || actualQuantity <= 0}
                            onPress={() =>
                              onMaterialChange(
                                materialUsage.map((item) =>
                                  item === row
                                    ? {
                                        ...item,
                                        actualQuantity: Math.max(
                                          0,
                                          actualQuantity - 1,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="items-center justify-center px-4 py-2 disabled:opacity-40"
                          >
                            <Ionicons
                              name="remove"
                              size={18}
                              color={themeColor(BLUE_TEXT)}
                            />
                          </Pressable>
                          <TextInput
                            editable={!disabled}
                            keyboardType="number-pad"
                            value={String(actualQuantity)}
                            onChangeText={(text) => {
                              const quantity = Math.max(
                                0,
                                Number.parseInt(text.replace(/\D/g, ''), 10) ||
                                  0,
                              );
                              onMaterialChange(
                                materialUsage.map((item) =>
                                  item === row
                                    ? { ...item, actualQuantity: quantity }
                                    : item,
                                ),
                              );
                            }}
                            className="w-16 border-x border-slate-200 dark:border-slate-700 px-2 py-2 text-center text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]"
                          />
                          <Pressable
                            disabled={disabled}
                            onPress={() =>
                              onMaterialChange(
                                materialUsage.map((item) =>
                                  item === row
                                    ? {
                                        ...item,
                                        actualQuantity: actualQuantity + 1,
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="items-center justify-center px-4 py-2 disabled:opacity-40"
                          >
                            <Ionicons
                              name="add"
                              size={18}
                              color={themeColor(BLUE_TEXT)}
                            />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              {!disabled ? (
                <Pressable
                  onPress={() =>
                    onMaterialChange([
                      ...materialUsage,
                      {
                        type: group.type,
                        slotId: `${group.type}-material-${Date.now()}`,
                        estimatedQuantity: group.estimatedQuantity,
                      },
                    ])
                  }
                  className="mt-3 items-center rounded-xl border border-purple-100 dark:border-[#6b21a8] px-3 py-3"
                >
                  <Text className="font-bold text-[#7c3aed] dark:text-[#c4b5fd]">
                    ＋ Add Another {group.type}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {!disabled ? (
        <Pressable
          disabled={availableMaterialTypes.length === 0}
          onPress={() => setTypePicker('material')}
          className="mt-4 items-center rounded-xl border border-purple-200 dark:border-[#6b21a8] px-3 py-4 disabled:opacity-40"
        >
          <Text className="font-extrabold text-[#7c3aed] dark:text-[#c4b5fd]">
            ＋ Add Material Type
          </Text>
        </Pressable>
      ) : null}
      <ResourceCatalogPicker
        visible={Boolean(picker)}
        title={picker?.title || 'Select resource'}
        items={picker?.items || []}
        selectedId={
          picker?.kind === 'equipment'
            ? picker.row.equipmentId
            : picker?.row.materialId
        }
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (!picker) return;
          if (picker.kind === 'equipment') {
            onEquipmentChange(
              equipmentUsage.map((row) =>
                row === picker.row ? { ...row, equipmentId: id } : row,
              ),
            );
          } else {
            onMaterialChange(
              materialUsage.map((row) =>
                row === picker.row
                  ? {
                      ...row,
                      materialId: id,
                      actualQuantity: row.actualQuantity ?? 1,
                    }
                  : row,
              ),
            );
          }
          setPicker(null);
        }}
      />
      <ResourceTypePicker
        visible={typePicker === 'equipment'}
        title="Add Equipment Block"
        types={availableEquipmentTypes}
        accentColor={BLUE_TEXT}
        onClose={() => setTypePicker(null)}
        onSelect={(type) => {
          onEquipmentChange([
            ...equipmentUsage,
            {
              type,
              slotId: `additional-equipment-${normalizedResourceType(type)}-${Date.now()}`,
            },
          ]);
          setTypePicker(null);
        }}
      />
      <ResourceTypePicker
        visible={typePicker === 'material'}
        title="Add Material Block"
        types={availableMaterialTypes}
        accentColor="#7c3aed"
        onClose={() => setTypePicker(null)}
        onSelect={(type) => {
          onMaterialChange([
            ...materialUsage,
            {
              type,
              slotId: `additional-material-${normalizedResourceType(type)}-${Date.now()}`,
              estimatedQuantity: 0,
            },
          ]);
          setTypePicker(null);
        }}
      />
    </Card>
  );
}

function asInputValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return JSON.stringify(value);
}

function fieldInitialValue(
  field: FormField,
  suggested: Record<string, unknown>,
) {
  if (Object.prototype.hasOwnProperty.call(suggested, field.id))
    return suggested[field.id];
  if (
    field.ui &&
    Object.prototype.hasOwnProperty.call(field.ui, 'defaultValue')
  ) {
    return field.ui.defaultValue;
  }
  if (field.type === 'checkbox') return false;
  if (field.type === 'timesheet') return [];
  if (field.type === 'resource_usage') return { equipment: [], materials: [] };
  if (field.type === 'work_order_types') return [];
  return '';
}

function appendUniqueLine(current: unknown, line: string): string {
  const trimmed = asInputValue(current).trim();
  if (!trimmed) return line;
  const lines = trimmed.split('\n').map((v) => v.trim());
  if (lines.includes(line)) return trimmed;
  return `${trimmed}\n${line}`;
}

function asTimesheetRows(value: unknown): TimesheetWorkerEntry[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is TimesheetWorkerEntry => {
        return (
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as TimesheetWorkerEntry).workerId === 'string'
        );
      })
    : [];
}

function countTimesheetRows(data: Record<string, unknown> | undefined) {
  if (!data) return 0;
  return Object.values(data).reduce<number>(
    (count, value) => count + asTimesheetRows(value).length,
    0,
  );
}

function submissionCoversVisibleTimesheets(
  submission: { data?: Record<string, unknown> },
  visibleData: Record<string, unknown> | undefined,
) {
  const visibleRows = countTimesheetRows(visibleData);
  if (visibleRows === 0) return true;
  return countTimesheetRows(submission.data) >= visibleRows;
}

function submissionHasCompletedTimesheets(
  submission: { data?: Record<string, unknown> },
  visibleData: Record<string, unknown> | undefined,
) {
  if (!submissionCoversVisibleTimesheets(submission, visibleData)) return false;
  const rows = Object.values(submission.data ?? {}).flatMap(asTimesheetRows);
  return rows.length > 0 && rows.every((row) => row.status === 'completed');
}

function isSignatureValue(value: unknown): value is SignatureValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as SignatureValue).type === 'signature-image' &&
    typeof (value as SignatureValue).dataUrl === 'string'
  );
}

function mergeTimesheetRows(
  suggestedValue: unknown,
  existingValue: unknown,
  settings?: MobileCompanySettings,
): TimesheetWorkerEntry[] {
  const suggestedRows = asTimesheetRows(suggestedValue);
  const existingRows = asTimesheetRows(existingValue);
  if (existingRows.length === 0) return suggestedRows;
  if (suggestedRows.length === 0) return existingRows;

  const existingByWorkerId = new Map(
    existingRows.map((row) => [row.workerId, row]),
  );
  const merged = suggestedRows.map((row) => {
    const existing = existingByWorkerId.get(row.workerId);
    const result = {
      ...row,
      ...(existing ?? {}),
      singleShiftDay: row.singleShiftDay,
      scheduledStartTime:
        row.scheduledStartTime || existing?.scheduledStartTime,
      scheduledEndTime: row.scheduledEndTime || existing?.scheduledEndTime,
    };
    if (
      (!settings?.overtimeRules?.allowEarlyStart &&
        startIsBeforeScheduled(result)) ||
      !timesheetDurationIsPlausible(result, settings)
    ) {
      result.startTime = row.startTime || row.scheduledStartTime;
      result.endTime = row.endTime || row.scheduledEndTime;
    }
    return result;
  });
  const suggestedWorkerIds = new Set(suggestedRows.map((row) => row.workerId));
  const extraExistingRows = existingRows.filter(
    (row) => !suggestedWorkerIds.has(row.workerId),
  );
  return [...merged, ...extraExistingRows];
}

function applyTimesheetLunchDefault(
  value: unknown,
  lunchTakenDefault: boolean | undefined,
  savedValue: unknown,
) {
  const rows = asTimesheetRows(value);
  if (typeof lunchTakenDefault !== 'boolean') return rows;

  const savedByWorkerId = new Map(
    asTimesheetRows(savedValue).map((row) => [row.workerId, row]),
  );
  return rows.map((row) => {
    const savedRow = savedByWorkerId.get(row.workerId);
    const hasSavedFormAnswer = typeof savedRow?.lunchTaken === 'boolean';
    const hasCompletedTimesheet = row.status === 'completed';
    return hasSavedFormAnswer || hasCompletedTimesheet
      ? row
      : { ...row, lunchTaken: lunchTakenDefault };
  });
}

function formFieldValue(
  field: FormField,
  suggestedData: Record<string, unknown>,
  existingData: Record<string, unknown>,
  settings?: MobileCompanySettings,
) {
  const suggested = fieldInitialValue(field, suggestedData);
  if (
    field.dataBinding?.path &&
    field.dataBinding.editable === false &&
    Object.prototype.hasOwnProperty.call(suggestedData, field.id)
  ) {
    return suggested;
  }
  if (!Object.prototype.hasOwnProperty.call(existingData, field.id))
    return suggested;
  if (field.type === 'timesheet') {
    return mergeTimesheetRows(suggested, existingData[field.id], settings);
  }
  return existingData[field.id];
}

function initializeResourceUsage(
  value: unknown,
  plans: FormContextPreview['resourcePlans'],
): { equipment: ResourceUsageRow[]; materials: ResourceUsageRow[] } {
  const current =
    typeof value === 'object' && value !== null
      ? (value as { equipment?: unknown; materials?: unknown })
      : {};
  const equipment = Array.isArray(current.equipment)
    ? (current.equipment as ResourceUsageRow[]).map((row) => {
        if (row.type !== '__additional_equipment__') return row;
        const item = plans?.additionalEquipment.find(
          (candidate) => candidate.id === row.equipmentId,
        );
        return item ? { ...row, type: item.type } : row;
      })
    : [];
  const materials = Array.isArray(current.materials)
    ? (current.materials as ResourceUsageRow[])
        .map((row) => {
          if (row.type !== '__additional_material__') return row;
          const item = plans?.additionalMaterials.find(
            (candidate) => candidate.id === row.materialId,
          );
          return item ? { ...row, type: item.type } : row;
        })
        .filter(
          (row) =>
            !(
              row.slotId?.startsWith('planned-material-') &&
              !row.materialId &&
              (Number(row.actualQuantity) || 0) === 0
            ),
        )
    : [];

  for (const group of plans?.equipment ?? []) {
    const count = equipment.filter((row) => row.type === group.type).length;
    for (let index = count; index < group.estimatedQuantity; index += 1) {
      equipment.push({
        type: group.type,
        slotId: `planned-equipment-${group.type}-${index}`,
        estimatedQuantity: group.estimatedQuantity,
      });
    }
  }
  for (const group of plans?.materials ?? []) {
    for (const materialId of group.materialIds ?? []) {
      if (
        materials.some(
          (row) => row.type === group.type && row.materialId === materialId,
        )
      )
        continue;
      const suggestedQuantity = Math.max(
        0,
        Number(
          group.items.find((item) => item.id === materialId)?.estimatedQuantity,
        ) || 0,
      );
      materials.push({
        type: group.type,
        materialId,
        slotId: `planned-material-${group.type}-${materialId}`,
        estimatedQuantity: suggestedQuantity,
        actualQuantity: suggestedQuantity,
      });
    }
  }
  return { equipment, materials };
}

function applySelectedShiftSchedule(
  value: unknown,
  scheduledStartTime?: string,
  scheduledEndTime?: string,
  settings?: MobileCompanySettings,
) {
  if (!scheduledStartTime || !scheduledEndTime) return value;
  return asTimesheetRows(value).map((row) => {
    const previousScheduledStart = row.scheduledStartTime;
    const previousScheduledEnd = row.scheduledEndTime;
    const usesScheduledStart =
      !row.startTime || row.startTime === previousScheduledStart;
    const usesScheduledEnd =
      !row.endTime || row.endTime === previousScheduledEnd;
    const next = {
      ...row,
      scheduledStartTime,
      scheduledEndTime,
      startTime: usesScheduledStart ? scheduledStartTime : row.startTime,
      endTime: usesScheduledEnd ? scheduledEndTime : row.endTime,
    };

    if (!timesheetDurationIsPlausible(next, settings)) {
      next.startTime = scheduledStartTime;
      next.endTime = scheduledEndTime;
    }
    return next;
  });
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function timeToMinutes(value?: string) {
  const normalized = (value || '').trim();
  const twelveHourMatch = normalized.match(
    /^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i,
  );
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const period = twelveHourMatch[3].toUpperCase();
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (period === 'A' && hours === 12) hours = 0;
    if (period === 'P' && hours !== 12) hours += 12;
    return hours * 60 + minutes;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const TIMESHEET_MINUTE_INTERVAL = 15 as const;

function snapTimesheetDateToInterval(value: Date) {
  const snapped = new Date(value);
  const totalMinutes = snapped.getHours() * 60 + snapped.getMinutes();
  const roundedMinutes =
    Math.round(totalMinutes / TIMESHEET_MINUTE_INTERVAL) *
    TIMESHEET_MINUTE_INTERVAL;
  snapped.setHours(0, roundedMinutes, 0, 0);
  return snapped;
}

function timesheetTimeToDate(value?: string) {
  const minutes = timeToMinutes(value);
  const date = new Date();
  date.setSeconds(0, 0);
  if (minutes !== null) {
    date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  }
  return snapTimesheetDateToInterval(date);
}

function formatTimesheetTime(value: Date) {
  const snapped = snapTimesheetDateToInterval(value);
  const hours = snapped.getHours();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(snapped.getMinutes()).padStart(2, '0')} ${period}`;
}

function displayTimesheetTime(value?: string) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return value?.trim() || '';

  const hours = Math.floor(minutes / 60);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes % 60).padStart(2, '0')} ${period}`;
}

function timesheetTimeline(row: TimesheetWorkerEntry) {
  const start = timeToMinutes(row.startTime);
  const end = timeToMinutes(row.endTime);
  const scheduledStart = timeToMinutes(row.scheduledStartTime);
  const scheduledEnd = timeToMinutes(row.scheduledEndTime);
  const overnightShift =
    scheduledStart !== null &&
    scheduledEnd !== null &&
    scheduledEnd <= scheduledStart;
  let adjustedStart = start;
  let adjustedEnd = end;

  if (
    overnightShift &&
    adjustedStart !== null &&
    scheduledEnd !== null &&
    adjustedStart <= scheduledEnd
  ) {
    adjustedStart += 24 * 60;
  }
  if (
    overnightShift &&
    adjustedEnd !== null &&
    adjustedStart !== null &&
    adjustedEnd <= adjustedStart
  ) {
    adjustedEnd += 24 * 60;
  }

  return {
    start,
    end,
    scheduledStart,
    scheduledEnd,
    adjustedStart,
    adjustedEnd,
    overnightShift,
  };
}

function startIsBeforeScheduled(row: TimesheetWorkerEntry) {
  const timeline = timesheetTimeline(row);
  return (
    timeline.adjustedStart !== null &&
    timeline.scheduledStart !== null &&
    timeline.adjustedStart < timeline.scheduledStart
  );
}

function timesheetDurationIsPlausible(
  row: TimesheetWorkerEntry,
  settings?: MobileCompanySettings,
) {
  const timeline = timesheetTimeline(row);
  if (
    timeline.adjustedStart === null ||
    timeline.adjustedEnd === null ||
    timeline.adjustedEnd <= timeline.adjustedStart
  ) {
    return false;
  }
  return (
    timeline.adjustedEnd - timeline.adjustedStart <=
    (settings?.overtimeRules?.allowEarlyStart ? 24 : 16) * 60
  );
}

function timesheetTimeError(
  row: TimesheetWorkerEntry,
  settings?: MobileCompanySettings,
) {
  const timeline = timesheetTimeline(row);
  if (timeline.start === null || timeline.end === null)
    return 'Use HH:mm AM/PM format for Start Time and End Time.';
  if (
    !settings?.overtimeRules?.allowEarlyStart &&
    startIsBeforeScheduled(row)
  ) {
    return `Start Time cannot be earlier than the scheduled shift start (${row.scheduledStartTime}).`;
  }
  if (
    timeline.adjustedStart === null ||
    timeline.adjustedEnd === null ||
    timeline.adjustedEnd <= timeline.adjustedStart
  ) {
    return 'End Time must be greater than Start Time.';
  }
  return '';
}

function calculateTimesheetHours(
  row: TimesheetWorkerEntry,
  settings?: MobileCompanySettings,
) {
  const timeline = timesheetTimeline(row);
  if (
    timeline.adjustedStart === null ||
    timeline.adjustedEnd === null ||
    timeline.adjustedEnd <= timeline.adjustedStart
  ) {
    return { st: 0, ot: 0, dt: 0, total: 0 };
  }

  const totalHours = (timeline.adjustedEnd - timeline.adjustedStart) / 60;
  const rules = settings?.overtimeRules;
  const lunchDeduction =
    (rules?.yesLunchDeductionEnabled ?? false) &&
    row.lunchTaken === true &&
    totalHours > Number(rules?.yesLunchDeductionMinimumHours ?? 0)
      ? Number(rules?.yesLunchDeductionHours ?? 0)
      : 0;
  const payableHours = Math.max(0, totalHours - lunchDeduction);
  const lunchCredit =
    (rules?.noLunchCreditEnabled ?? true) &&
    row.lunchTaken === false &&
    totalHours > Number(rules?.noLunchCreditMinimumHours ?? 7)
      ? Number(rules?.noLunchCreditHours ?? 1)
      : 0;
  const target = noLunchCreditTargetForDate(row.shiftDate, settings);
  const weekday = timesheetWeekday(row.shiftDate);
  let st: number;
  let creditedOt: number;
  let dt: number;

  if (weekday === 0 && (rules?.sundayAllDoubleTime ?? true)) {
    st = 0;
    creditedOt = 0;
    dt = payableHours + lunchCredit;
  } else if (weekday === 6 && (rules?.saturdayAllOvertime ?? true)) {
    const saturdayThreshold = Number(rules?.saturdayDoubleTimeThreshold ?? 12);
    st = 0;
    creditedOt = Math.min(payableHours, saturdayThreshold) + lunchCredit;
    dt = Math.max(0, payableHours - saturdayThreshold);
  } else {
    const regularLimit = Number(rules?.regularHoursLimit ?? 8);
    const doubleTimeThreshold = Math.max(
      Number(rules?.doubleTimeThreshold ?? 12),
      regularLimit,
    );
    const ot = Math.max(
      0,
      Math.min(payableHours, doubleTimeThreshold) - regularLimit,
    );
    st =
      Math.min(payableHours, regularLimit) +
      (target === 'st' ? lunchCredit : 0);
    creditedOt = ot + (target === 'ot' ? lunchCredit : 0);
    dt = Math.max(0, payableHours - doubleTimeThreshold);
  }

  if (row.singleShiftDay && st > 0 && st < 8) st = 8;

  return {
    st: roundHours(st),
    ot: roundHours(creditedOt),
    dt: roundHours(dt),
    total: roundHours(st + creditedOt + dt),
  };
}

function timesheetWeekday(value?: string) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return -1;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return Number.isNaN(date.getTime()) ? -1 : date.getDay();
}

function noLunchCreditTargetForDate(
  shiftDate?: string,
  settings?: MobileCompanySettings,
): 'st' | 'ot' {
  const rules = settings?.overtimeRules;
  if (rules?.noLunchCreditTarget !== 'ot') return 'st';
  const effectiveDate = (rules.noLunchCreditEffectiveDate || '').slice(0, 10);
  const rowDate = (shiftDate || '').slice(0, 10);
  return effectiveDate && rowDate && rowDate >= effectiveDate ? 'ot' : 'st';
}

function needsInitialTimesheetCalculation(
  row: TimesheetWorkerEntry,
  settings?: MobileCompanySettings,
) {
  return Boolean(
    row.startTime &&
    row.endTime &&
    !timesheetTimeError(row, settings) &&
    (row.st === undefined ||
      row.ot === undefined ||
      row.dt === undefined ||
      row.total === undefined ||
      Number(row.total) === 0),
  );
}

function shortDateLabel(iso?: string) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function categoryKey(category?: string) {
  const key = (category || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
  if (key.includes('timesheet')) return 'timesheet';
  if (key.includes('incident')) return 'incident';
  if (key.includes('work order') || key.includes('workorder'))
    return 'workorder';
  return 'other';
}

function templateCategoryKey(
  template: FormTemplate | null,
  fallbackCategory?: string,
) {
  const category = categoryKey(template?.category || fallbackCategory);
  if (category !== 'other') return category;
  const nameKey = (template?.name || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ');
  if (nameKey.includes('timesheet') || nameKey.includes('time sheet'))
    return 'timesheet';
  if (nameKey.includes('incident')) return 'incident';
  if (nameKey.includes('work order') || nameKey.includes('workorder'))
    return 'workorder';
  if (template?.fields?.some((field) => field.type === 'timesheet'))
    return 'timesheet';
  return 'other';
}

function mobileRoleIsHidden(roles: string[] | undefined, role?: string) {
  if (!role || !Array.isArray(roles) || roles.length === 0) return false;
  return roles
    .map((item) => item.trim().toLowerCase())
    .includes(role.trim().toLowerCase());
}

function fieldVisibleForMobileRole(
  field: FormField,
  role?: string,
  canManageShiftWorkOrder = false,
) {
  const legacyShiftAccessRule =
    field.type === 'signature' &&
    field.rules?.hiddenForMobileRoles
      ?.map((item) => item.trim().toLowerCase())
      .includes('viewer');
  if (
    field.rules?.requiresShiftWorkOrderAccessOnMobile ||
    legacyShiftAccessRule
  ) {
    return canManageShiftWorkOrder;
  }
  return !mobileRoleIsHidden(field.rules?.hiddenForMobileRoles, role);
}

function roleCanSubmitFinalTimesheets(
  role: string | undefined,
  hasPermission: (permission: string) => boolean,
) {
  return (
    role === 'scheduler' ||
    role === 'manager' ||
    role === 'admin' ||
    hasPermission('mobile.work-orders.submit') ||
    hasPermission('form-submissions.write') ||
    hasPermission('timesheets.write') ||
    hasPermission('work-orders.write')
  );
}

function mobileFieldLabel(field: FormField) {
  const key = `${field.id} ${field.key || ''}`
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
  return field.type === 'signature' && key.includes('workersignature')
    ? 'Lead Signature'
    : field.label;
}

function FieldLabel({ field }: { field: FormField }) {
  return (
    <Text
      className="mb-[7px] text-[12px] font-extrabold text-[#5d6c87] dark:text-slate-300"
      style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}
    >
      {mobileFieldLabel(field)}
      {field.required ? ' *' : ''}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="mb-3 rounded-[20px] bg-white dark:bg-slate-800 p-4 border-[#dce4f0] dark:border-[#334155]"
      style={{ borderWidth: 1 }}
    >
      {children}
    </View>
  );
}

function TextField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { themeColor } = useNativeTheme();
  const multiline = field.type === 'textarea';
  return (
    <TextInput
      value={asInputValue(value)}
      onChangeText={(text) =>
        onChange(field.type === 'number' ? text.replace(/[^\d.-]/g, '') : text)
      }
      placeholder={field.placeholder}
      placeholderTextColor={themeColor(MUTED)}
      keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'}
      multiline={multiline}
      className="rounded-[14px] px-3.5 py-3.5 text-[14px] text-[#182641] dark:text-slate-100 border-[#dce4f0] dark:border-[#334155] bg-[#fff] dark:bg-[#1e293b]"
      style={{
        borderWidth: 1,
        minHeight: multiline ? 110 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}

function OptionChip({
  label,
  active,
  onPress,
  tone = 'blue',
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: 'blue' | 'amber' | 'slate';
}) {
  const { themeColor } = useNativeTheme();
  const activeBorder =
    tone === 'amber' ? AMBER_BORDER : tone === 'slate' ? LINE : BLUE_BORDER;
  const activeBg =
    tone === 'amber' ? AMBER_SOFT : tone === 'slate' ? '#f8fafc' : BLUE_SOFT;
  const activeText =
    tone === 'amber' ? AMBER_TEXT : tone === 'slate' ? '#334155' : BLUE_TEXT;
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full border px-3 py-2.5"
      style={{
        borderColor: themeColor(active ? activeBorder : LINE, 'border'),
        backgroundColor: themeColor(active ? activeBg : '#fff', 'background'),
      }}
    >
      <Text
        className="text-[13px] font-bold"
        style={{ color: themeColor(active ? activeText : '#50617d', 'text') }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Segment({
  from,
  to,
  scaleX,
  scaleY,
}: {
  from: SignaturePoint;
  to: SignaturePoint;
  scaleX: number;
  scaleY: number;
}) {
  const x1 = from.x * scaleX;
  const y1 = from.y * scaleY;
  const x2 = to.x * scaleX;
  const y2 = to.y * scaleY;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const angle = `${Math.atan2(dy, dx)}rad`;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: length,
        height: 2,
        backgroundColor: '#172033',
        borderRadius: 1,
        transform: [{ rotate: angle }],
        transformOrigin: '0px 1px',
      }}
    />
  );
}

function freehandStrokePath(stroke: SignatureStroke): SkPath | null {
  const outline = getStroke(
    stroke.map((point) => [point.x, point.y]),
    {
      size: 1.4,
      thinning: 0.08,
      smoothing: 0.78,
      streamline: 0.18,
      simulatePressure: false,
      easing: (pressure) => pressure,
      start: {
        cap: true,
        taper: 0,
        easing: (value) => value,
      },
      end: {
        cap: true,
        taper: 0,
        easing: (value) => value,
      },
    },
  );

  if (outline.length === 0) return null;
  const path = Skia.Path.Make();
  path.setIsVolatile(true);
  if (outline.length === 1) {
    const [x, y] = outline[0];
    path.moveTo(x, y);
    path.lineTo(x + 0.1, y + 0.1);
    path.close();
    return path;
  }

  const first = outline[0];
  path.moveTo(first[0], first[1]);

  for (let index = 1; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    path.quadTo(
      current[0],
      current[1],
      (current[0] + next[0]) / 2,
      (current[1] + next[1]) / 2,
    );
  }

  path.close();
  return path;
}

function SignaturePad({
  value,
  onChange,
  disabled,
  instanceId,
}: {
  value: unknown;
  onChange: (value: SignatureValue | null) => void;
  disabled?: boolean;
  instanceId: string;
}) {
  const { themeColor } = useNativeTheme();
  const signature = isSignatureValue(value) ? value : null;
  const [open, setOpen] = useState(false);
  const [completedPaths, setCompletedPaths] = useState<SkPath[]>([]);
  const [activePath, setActivePath] = useState<SkPath | null>(null);

  const [redrawCounter, setRedrawCounter] = useState(0);
  const [showExistingSignature, setShowExistingSignature] = useState(false);
  const insets = useSafeAreaInsets();
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const strokesRef = useRef<SignatureStroke[]>([]);
  const activePathRef = useRef<SkPath | null>(null);
  const canvasRef = useCanvasRef();

  const openSignature = () => {
    strokesRef.current = [];
    activePathRef.current = null;
    setCompletedPaths([]);
    setActivePath(null);
    setShowExistingSignature(Boolean(signature?.dataUrl));
    setOpen(true);
  };

  const disposeSignatureSession = () => {
    strokesRef.current = [];
    activePathRef.current = null;
    setCompletedPaths([]);
    setActivePath(null);
    setShowExistingSignature(false);
    setOpen(false);
  };

  const saveSignature = async () => {
    if (strokesRef.current.length === 0) {
      if (showExistingSignature && signature) {
        disposeSignatureSession();
        return;
      }
      Alert.alert(
        'Signature required',
        'Please draw your signature before saving.',
      );
      return;
    }

    try {
      const image = await canvasRef.current?.makeImageSnapshotAsync();
      const base64 = image?.encodeToBase64(ImageFormat.PNG, 100);
      if (!base64) {
        Alert.alert(
          'Signature error',
          'The signature could not be exported. Please try again.',
        );
        return;
      }
      onChange({
        type: 'signature-image',
        dataUrl: `data:image/png;base64,${base64}`,
        trimmed: false,
        capturedAt: new Date().toISOString(),
      });
      disposeSignatureSession();
    } catch {
      Alert.alert(
        'Signature error',
        'The signature could not be exported. Please try again.',
      );
    }
  };

  const clearSignature = () => {
    strokesRef.current = [];
    activePathRef.current = null;
    setCompletedPaths([]);
    setActivePath(null);
    setShowExistingSignature(false);
    onChange(null);
  };

  const updateCanvasSize = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCanvasSize({
      width: Math.max(1, width),
      height: Math.max(1, height),
    });
  };

  const addPoint = useCallback(
    (point: SignaturePoint, startsStroke: boolean) => {
      if (startsStroke) {
        setShowExistingSignature(false);
        const next = [...strokesRef.current, [point]];
        strokesRef.current = next;
        const path = Skia.Path.Make();
        path.setIsVolatile(true);
        path.moveTo(point.x, point.y);
        activePathRef.current = path;
        setActivePath(path);
        setRedrawCounter((value) => value + 1);
        return;
      }

      if (strokesRef.current.length === 0) return;
      const activeStroke = strokesRef.current[strokesRef.current.length - 1];
      const previousPoint = activeStroke[activeStroke.length - 1];
      const distance = Math.hypot(
        point.x - previousPoint.x,
        point.y - previousPoint.y,
      );
      if (distance < 0.5) return;

      const next = strokesRef.current.map((stroke, index) =>
        index === strokesRef.current.length - 1 ? [...stroke, point] : stroke,
      );
      strokesRef.current = next;
      activePathRef.current?.lineTo(point.x, point.y);

      setRedrawCounter((value) => value + 1);
    },
    [],
  );

  const finishStroke = useCallback(() => {
    const currentStroke = strokesRef.current[strokesRef.current.length - 1];
    if (currentStroke?.length === 1) {
      const point = currentStroke[0];
      activePathRef.current?.lineTo(point.x + 0.1, point.y + 0.1);
    }

    activePathRef.current = null;
    setActivePath(null);
    setRedrawCounter(0);
    setCompletedPaths(
      strokesRef.current.map(freehandStrokePath).filter(Boolean) as SkPath[],
    );
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          addPoint(
            {
              x: event.nativeEvent.locationX,
              y: event.nativeEvent.locationY,
            },
            true,
          );
        },
        onPanResponderMove: (event) => {
          addPoint(
            {
              x: event.nativeEvent.locationX,
              y: event.nativeEvent.locationY,
            },
            false,
          );
        },
        onPanResponderRelease: finishStroke,
        onPanResponderTerminate: finishStroke,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [addPoint, finishStroke],
  );

  return (
    <View>
      <Pressable
        disabled={disabled}
        onPress={openSignature}
        className="mt-3 overflow-hidden rounded-2xl"
        style={{
          minHeight: 160,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: themeColor(
            signature ? BLUE_BORDER : '#cfd9ea',
            'border',
          ),
          backgroundColor: signature
            ? '#fff'
            : themeColor('#fbfcff', 'background'),
        }}
      >
        {signature ? (
          <Image
            source={{ uri: signature.dataUrl }}
            resizeMode="contain"
            className="h-[160px] w-full"
          />
        ) : (
          <View className="h-[160px] items-center justify-center px-4">
            <Ionicons
              name="create-outline"
              size={24}
              color={themeColor('#8090ad')}
            />
            <Text className="mt-2 text-center text-sm font-semibold text-[#8090ad] dark:text-[#94a3b8]">
              Tap to open full screen signature
            </Text>
          </View>
        )}
      </Pressable>
      <View className="mt-2 flex-row items-center justify-between">
        <Text
          className="text-xs font-semibold"
          style={{ color: themeColor(signature ? BLUE_TEXT : MUTED, 'text') }}
        >
          {signature ? 'Signature captured' : 'Required signature'}
        </Text>
        {signature ? (
          <Pressable
            disabled={disabled}
            onPress={() => onChange(null)}
            hitSlop={8}
          >
            <Text
              className="text-xs font-extrabold"
              style={{
                color: themeColor(disabled ? MUTED : '#dc2626', 'text'),
              }}
            >
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={disposeSignatureSession}
      >
        <SafeAreaView
          edges={['bottom']}
          className="flex-1 bg-white dark:bg-slate-800"
        >
          <View
            className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3"
            style={{ paddingTop: insets.top + 8 }}
          >
            <Pressable
              onPress={disposeSignatureSession}
              className="rounded-xl bg-slate-100 dark:bg-slate-900 px-4 py-2"
            >
              <Text className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                Cancel
              </Text>
            </Pressable>
            <Text className="text-base font-extrabold text-[#182641] dark:text-[#f1f5f9]">
              Signature
            </Text>
            <Pressable
              onPress={saveSignature}
              className="rounded-xl bg-[#4368ef] px-4 py-2"
            >
              <Text className="text-sm font-extrabold text-white">Save</Text>
            </Pressable>
          </View>
          <View
            className="flex-1 bg-white"
            onLayout={updateCanvasSize}
            {...panResponder.panHandlers}
          >
            {showExistingSignature && signature?.dataUrl ? (
              <Image
                source={{ uri: signature.dataUrl }}
                resizeMode="contain"
                className="absolute inset-0 h-full w-full"
              />
            ) : null}
            <Canvas
              ref={canvasRef}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {!showExistingSignature ? <Fill color="#ffffff" /> : null}
              {completedPaths.map((path, index) => (
                <SkiaPath
                  key={`completed-${index}`}
                  path={path}
                  color="#172033"
                  style="fill"
                />
              ))}
              {activePath ? (
                <SkiaPath
                  key={`active-${redrawCounter}`}
                  path={activePath}
                  color="#172033"
                  style="stroke"
                  strokeWidth={3}
                  strokeCap="round"
                  strokeJoin="round"
                />
              ) : null}
            </Canvas>
          </View>
          <View className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
            <Pressable
              onPress={clearSignature}
              className="items-center rounded-xl bg-slate-100 dark:bg-slate-900 py-3"
            >
              <Text className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                Clear signature
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function NativeTimeControl({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const { themeColor } = useNativeTheme();
  const [iosPickerVisible, setIosPickerVisible] = useState(false);
  const [iosPickerReady, setIosPickerReady] = useState(false);
  const [iosDraft, setIosDraft] = useState(() => timesheetTimeToDate(value));
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const displayedValue = displayTimesheetTime(value);

  const theme = {
    modalBg: isDark ? '#0f172a' : '#ffffff',
    text: isDark ? '#ffffff' : TEXT,
    muted: isDark ? '#94a3b8' : MUTED,
    border: isDark ? '#334155' : '#e2e8f0',
    blueText: isDark ? '#60a5fa' : BLUE_TEXT,
    pickerTheme: (isDark ? 'dark' : 'light') as 'light' | 'dark',
  };

  useEffect(() => {
    if (!iosPickerVisible) {
      setIosPickerReady(false);
      return;
    }
    const timer = setTimeout(() => setIosPickerReady(true), 100);
    return () => clearTimeout(timer);
  }, [iosPickerVisible]);

  const openPicker = () => {
    const current = timesheetTimeToDate(value);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'time',
        display: 'default',
        is24Hour: false,
        minuteInterval: TIMESHEET_MINUTE_INTERVAL,
        onChange: (event: DateTimePickerEvent, selectedDate?: Date) => {
          if (event.type === 'set' && selectedDate) {
            onChange(formatTimesheetTime(selectedDate));
          }
        },
      });
      return;
    }
    setIosDraft(current);
    setIosPickerVisible(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select ${label}`}
        onPress={openPicker}
        className="flex-1 rounded-xl border bg-white dark:bg-slate-800 p-3 active:bg-slate-50 dark:active:bg-slate-900"
        style={{
          borderColor: themeColor(invalid ? '#fecaca' : '#e2e8f0', 'border'),
        }}
      >
        <Text className="text-[10px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
          {label}
        </Text>
        <View className="mt-2 flex-row items-center justify-center gap-1.5">
          <Text
            className="text-center text-[20px] font-extrabold"
            style={{ color: themeColor(invalid ? '#dc2626' : TEXT, 'text') }}
          >
            {displayedValue || 'Select time'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={themeColor(invalid ? '#dc2626' : MUTED)}
          />
        </View>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={iosPickerVisible}
          transparent
          animationType="slide"
          presentationStyle="overFullScreen"
          onRequestClose={() => setIosPickerVisible(false)}
        >
          <View className="flex-1 justify-end bg-black/40">
            <Pressable
              accessibilityLabel="Close time picker"
              style={StyleSheet.absoluteFill}
              onPress={() => setIosPickerVisible(false)}
            />
            <View
              className="rounded-t-3xl pb-8"
              style={{
                backgroundColor: themeColor(theme.modalBg, 'background'),
              }}
            >
              <View
                className="flex-row items-center justify-between border-b px-5 py-3"
                style={{ borderColor: themeColor(theme.border, 'border') }}
              >
                <Pressable
                  onPress={() => setIosPickerVisible(false)}
                  className="px-1 py-2"
                >
                  <Text
                    className="text-base font-semibold"
                    style={{ color: themeColor(theme.blueText, 'text') }}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Text
                  className="text-base font-extrabold"
                  style={{ color: themeColor(theme.text, 'text') }}
                >
                  {label}
                </Text>
                <Pressable
                  onPress={() => {
                    onChange(formatTimesheetTime(iosDraft));
                    setIosPickerVisible(false);
                  }}
                  className="px-1 py-2"
                >
                  <Text
                    className="text-base font-extrabold"
                    style={{ color: themeColor(theme.blueText, 'text') }}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
              <View
                className="items-center"
                style={{
                  backgroundColor: themeColor(theme.modalBg, 'background'),
                }}
              >
                {iosPickerReady ? (
                  <DateTimePicker
                    key={`picker-${iosPickerVisible}`}
                    value={iosDraft}
                    mode="time"
                    display="spinner"
                    locale="en_US"
                    themeVariant={theme.pickerTheme}
                    minuteInterval={TIMESHEET_MINUTE_INTERVAL}
                    onChange={(_event, selectedDate) => {
                      if (selectedDate) {
                        setIosDraft(snapTimesheetDateToInterval(selectedDate));
                      }
                    }}
                    style={{
                      height: 216,
                      width: '100%',
                      backgroundColor: themeColor(theme.modalBg, 'background'),
                    }}
                  />
                ) : (
                  <View style={{ height: 216, width: '100%' }} />
                )}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function TimesheetField({
  value,
  onChange,
  settings,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  settings?: MobileCompanySettings;
}) {
  const { themeColor } = useNativeTheme();
  const rows = asTimesheetRows(value);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeRow = activeIndex !== null ? rows[activeIndex] : null;
  const calculationRulesKey = JSON.stringify({
    allowEarlyStart: settings?.overtimeRules?.allowEarlyStart ?? false,
    regularHoursLimit: settings?.overtimeRules?.regularHoursLimit ?? 8,
    doubleTimeThreshold: settings?.overtimeRules?.doubleTimeThreshold ?? 12,
    saturdayAllOvertime: settings?.overtimeRules?.saturdayAllOvertime ?? true,
    saturdayDoubleTimeThreshold:
      settings?.overtimeRules?.saturdayDoubleTimeThreshold ?? 12,
    sundayAllDoubleTime: settings?.overtimeRules?.sundayAllDoubleTime ?? true,
    noLunchCreditEnabled: settings?.overtimeRules?.noLunchCreditEnabled ?? true,
    noLunchCreditMinimumHours:
      settings?.overtimeRules?.noLunchCreditMinimumHours ?? 7,
    noLunchCreditHours: settings?.overtimeRules?.noLunchCreditHours ?? 1,
    noLunchCreditTarget: settings?.overtimeRules?.noLunchCreditTarget ?? 'st',
    noLunchCreditEffectiveDate:
      settings?.overtimeRules?.noLunchCreditEffectiveDate ?? '',
    yesLunchDeductionEnabled:
      settings?.overtimeRules?.yesLunchDeductionEnabled ?? false,
    yesLunchDeductionMinimumHours:
      settings?.overtimeRules?.yesLunchDeductionMinimumHours ?? 0,
    yesLunchDeductionHours:
      settings?.overtimeRules?.yesLunchDeductionHours ?? 0,
  });
  const appliedRulesKeyRef = useRef('');

  useEffect(() => {
    if (rows.length === 0) return;
    const rulesChanged = appliedRulesKeyRef.current !== calculationRulesKey;
    if (
      !rulesChanged &&
      !rows.some((row) => needsInitialTimesheetCalculation(row, settings))
    )
      return;
    appliedRulesKeyRef.current = calculationRulesKey;
    onChange(
      rows.map((row) => {
        return !timesheetTimeError(row, settings) &&
          (rulesChanged || needsInitialTimesheetCalculation(row, settings))
          ? { ...row, ...calculateTimesheetHours(row, settings) }
          : row;
      }),
    );
  }, [calculationRulesKey, onChange, rows, settings]);

  const updateRow = (
    index: number,
    patch: Partial<TimesheetWorkerEntry>,
    recalculate = false,
  ) => {
    const next = rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const merged = { ...row, ...patch };
      const hours = recalculate
        ? calculateTimesheetHours(merged, settings)
        : {};
      const st = Number((hours as TimesheetWorkerEntry).st ?? merged.st) || 0;
      const ot = Number((hours as TimesheetWorkerEntry).ot ?? merged.ot) || 0;
      const dt = Number((hours as TimesheetWorkerEntry).dt ?? merged.dt) || 0;
      return { ...merged, ...hours, total: roundHours(st + ot + dt) };
    });
    onChange(next);
  };

  const signAndNext = () => {
    if (activeIndex === null) return;
    if (activeRow) {
      const timeError = timesheetTimeError(activeRow, settings);
      if (timeError) {
        Alert.alert('Invalid timesheet time', timeError);
        return;
      }
    }
    if (!activeRow?.signature) {
      Alert.alert(
        'Signature required',
        'Please sign before completing this timesheet row.',
      );
      return;
    }
    updateRow(activeIndex, {
      status: 'completed',
    });
    const nextIndex = rows.findIndex(
      (row, index) => index > activeIndex && row.status !== 'completed',
    );
    setActiveIndex(nextIndex >= 0 ? nextIndex : null);
  };

  if (rows.length === 0) {
    return (
      <View className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
        <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          No workers found for this shift. Select a shift before opening this
          form.
        </Text>
      </View>
    );
  }

  if (activeRow && activeIndex !== null) {
    const timeError = timesheetTimeError(activeRow, settings);
    const startBeforeScheduled =
      !settings?.overtimeRules?.allowEarlyStart &&
      startIsBeforeScheduled(activeRow);
    const noLunchTarget = noLunchCreditTargetForDate(
      activeRow.shiftDate,
      settings,
    ).toUpperCase();
    const workOrderLabel = [activeRow.workOrderNumber, activeRow.workOrderTitle]
      .filter(Boolean)
      .join(' · ');
    return (
      <View>
        <Card>
          <Text className="text-[22px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
            {activeRow.workerName}
          </Text>
          <Text className="mt-1 text-[12px] font-semibold text-[#74819a] dark:text-[#94a3b8]">
            {activeRow.employeeLabel || `Employee #${activeIndex + 1}`}
          </Text>

          <View className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3">
            <Text className="text-[15px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
              {workOrderLabel || activeRow.workOrderId || 'Assignment'}
            </Text>
            <Text className="mt-1 text-[12px] text-[#74819a] dark:text-[#94a3b8]">
              {[
                shortDateLabel(activeRow.shiftDate),
                activeRow.startTime && activeRow.endTime
                  ? `${activeRow.startTime}-${activeRow.endTime}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>

          <View className="mt-3 flex-row gap-2">
            <NativeTimeControl
              label="Start Time"
              value={activeRow.startTime}
              invalid={startBeforeScheduled}
              onChange={(startTime) =>
                updateRow(activeIndex, { startTime }, true)
              }
            />
            <NativeTimeControl
              label="End Time"
              value={activeRow.endTime}
              invalid={Boolean(timeError && !startBeforeScheduled)}
              onChange={(endTime) => updateRow(activeIndex, { endTime }, true)}
            />
          </View>
          {timeError ? (
            <Text className="mt-1.5 text-[12px] font-semibold text-red-600 dark:text-[#fca5a5]">
              {timeError}
            </Text>
          ) : null}

          <View className="mt-3 flex-row gap-2">
            {(['st', 'ot', 'dt'] as const).map((key) => (
              <View
                key={key}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
              >
                <Text className="text-center text-[10px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
                  {key.toUpperCase()}
                </Text>
                <Text className="mt-2 text-center text-[22px] font-extrabold leading-[27px] text-[#182641] dark:text-[#f1f5f9]">
                  {Number(activeRow[key]) || 0}
                </Text>
              </View>
            ))}
            <View className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <Text className="text-center text-[10px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
                Total
              </Text>
              <Text className="mt-2 text-center text-[22px] font-extrabold leading-[27px] text-[#182641] dark:text-[#f1f5f9]">
                {Number(activeRow.total) || 0}
              </Text>
            </View>
          </View>

          <View className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <Text className="text-[10px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
              Lunch and Break Taken?
            </Text>
            <View className="mt-2 flex-row gap-2">
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map((item) => (
                <OptionChip
                  key={item.label}
                  label={item.label}
                  active={activeRow.lunchTaken === item.value}
                  onPress={() =>
                    updateRow(activeIndex, { lunchTaken: item.value }, true)
                  }
                />
              ))}
            </View>
            {(settings?.overtimeRules?.noLunchCreditEnabled ?? true) ? (
              <Text className="mt-2 text-[11px] text-[#74819a] dark:text-[#94a3b8]">
                Selecting No adds{' '}
                {settings?.overtimeRules?.noLunchCreditHours ?? 1} hour to{' '}
                {noLunchTarget} only after more than{' '}
                {settings?.overtimeRules?.noLunchCreditMinimumHours ?? 7} worked
                hours.
              </Text>
            ) : null}
            {(settings?.overtimeRules?.yesLunchDeductionEnabled ?? false) ? (
              <Text className="mt-1 text-[11px] text-[#74819a] dark:text-[#94a3b8]">
                Selecting Yes deducts{' '}
                {settings?.overtimeRules?.yesLunchDeductionHours ?? 0} hour
                after more than{' '}
                {settings?.overtimeRules?.yesLunchDeductionMinimumHours ?? 0}{' '}
                worked hours.
              </Text>
            ) : null}
          </View>

          <View className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
            <Text className="text-[10px] font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
              Employee Note
            </Text>
            <TextInput
              value={activeRow.employeeNote ?? ''}
              onChangeText={(text) =>
                updateRow(activeIndex, { employeeNote: text })
              }
              multiline
              placeholder="Add notes for this worker..."
              placeholderTextColor={themeColor(MUTED)}
              className="mt-2 text-[14px] text-[#182641] dark:text-[#f1f5f9]"
              style={{ minHeight: 54, textAlignVertical: 'top' }}
            />
          </View>

          <View className="mt-3 rounded-xl border border-blue-200 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554] p-3">
            <Text className="text-[13px] font-bold text-[#2f62e6] dark:text-[#93c5fd]">
              I confirm that the hours, lunch status, and notes shown above are
              correct for my work on this date.
            </Text>
          </View>
        </Card>

        <Card>
          <Text className="text-[14px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
            Employee Signature
          </Text>
          <SignaturePad
            key={`timesheet-signature:${activeRow.workOrderId}:${activeRow.workerId}:${activeIndex}`}
            instanceId={`timesheet-signature:${activeRow.workOrderId}:${activeRow.workerId}:${activeIndex}`}
            value={activeRow.signature}
            onChange={(signature) =>
              updateRow(activeIndex, { signature: signature ?? undefined })
            }
          />
          <View className="mt-3 flex-row gap-2">
            <Pressable
              onPress={() => setActiveIndex(null)}
              className="flex-1 items-center rounded-xl bg-slate-200 dark:bg-slate-800 py-3"
            >
              <Text className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                Back
              </Text>
            </Pressable>
            <Pressable
              onPress={signAndNext}
              className="flex-1 items-center rounded-xl py-3 bg-[#4368ef]"
            >
              <Text className="text-sm font-extrabold text-white">
                Sign & Next
              </Text>
            </Pressable>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {rows.map((row, index) => (
        <Pressable
          key={`${row.workerId}-${index}`}
          onPress={() => setActiveIndex(index)}
          className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
        >
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text className="text-[15px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                {row.workerName}
              </Text>
              <Text className="mt-1 text-[12px] text-[#74819a] dark:text-[#94a3b8]">
                {[row.workOrderNumber, row.workOrderTitle]
                  .filter(Boolean)
                  .join(' · ') || row.workOrderId}
              </Text>
              <Text className="mt-0.5 text-[12px] text-[#74819a] dark:text-[#94a3b8]">
                ST {Number(row.st) || 0} | OT {Number(row.ot) || 0} | DT{' '}
                {Number(row.dt) || 0} | Total {Number(row.total) || 0}
              </Text>
            </View>
            <View
              className="rounded-full px-3 py-1"
              style={{
                backgroundColor: themeColor(
                  row.status === 'completed' ? '#dcfce7' : '#fee2e2',
                  'background',
                ),
              }}
            >
              <Text
                className="text-[11px] font-extrabold"
                style={{
                  color: themeColor(
                    row.status === 'completed' ? '#15803d' : '#dc2626',
                    'text',
                  ),
                }}
              >
                {row.status === 'completed' ? 'Done' : 'Pending'}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function WorkOrderTypesField({
  options,
  catalogOptions,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  catalogOptions: string[];
  value: unknown;
  onChange: (value: string[]) => void;
  disabled: boolean;
}) {
  const { themeColor } = useNativeTheme();
  const selected = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const visibleOptions = uniqueResourceTypes([...options, ...selected]);
  const additionalCatalogOptions = uniqueResourceTypes(catalogOptions).filter(
    (type) =>
      !visibleOptions.some(
        (visible) =>
          normalizedResourceType(visible) === normalizedResourceType(type),
      ),
  );
  const toggle = (type: string) => {
    onChange(
      selected.includes(type)
        ? selected.filter((entry) => entry !== type)
        : [...selected, type],
    );
  };
  const addCatalogType = (type: string) => {
    const existing = selected.some(
      (entry) => normalizedResourceType(entry) === normalizedResourceType(type),
    );
    if (!existing) onChange([...selected, type]);
  };

  return (
    <View className="gap-2">
      {visibleOptions.length === 0 ? (
        <View className="rounded-xl border border-amber-200 dark:border-[#92400e] bg-amber-50 dark:bg-[#451a03] px-3 py-3">
          <Text className="text-sm font-bold text-[#c78518] dark:text-[#fcd34d]">
            No Work Order Types configured for this shift.
          </Text>
          <Text className="mt-1 text-xs text-[#74819a] dark:text-[#94a3b8]">
            Choose one from the Work Order Type catalog below or ask an
            administrator to configure the shift.
          </Text>
        </View>
      ) : null}
      {visibleOptions.map((type) => {
        const checked = selected.includes(type);
        return (
          <Pressable
            key={type}
            disabled={disabled}
            onPress={() => toggle(type)}
            className="flex-row items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3"
          >
            <Ionicons
              name={checked ? 'checkbox' : 'square-outline'}
              size={22}
              color={themeColor(checked ? BLUE_TEXT : MUTED)}
            />
            <Text className="flex-1 text-sm font-bold text-[#182641] dark:text-[#f1f5f9]">
              {type}
            </Text>
          </Pressable>
        );
      })}
      {!disabled ? (
        <View className="mt-2">
          <Text className="mb-2 text-xs font-extrabold uppercase text-[#74819a] dark:text-[#94a3b8]">
            Add another type
          </Text>
          {additionalCatalogOptions.length > 0 ? (
            <View className="gap-2">
              {additionalCatalogOptions.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => addCatalogType(type)}
                  className="flex-row items-center gap-3 rounded-xl border border-blue-200 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554] px-3 py-3"
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={22}
                    color={themeColor(BLUE_TEXT)}
                  />
                  <Text className="flex-1 text-sm font-bold text-[#2f62e6] dark:text-[#93c5fd]">
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="rounded-xl bg-slate-50 dark:bg-slate-900 px-3 py-3 text-sm text-[#74819a] dark:text-[#94a3b8]">
              No additional Work Order Types are available in the catalog.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function DynamicField({
  field,
  value,
  onChange,
  settings,
  instanceId,
  resourcePlans,
  workOrderTypes,
  disabled,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  settings?: MobileCompanySettings;
  instanceId: string;
  resourcePlans?: FormContextPreview['resourcePlans'];
  workOrderTypes?: string[];
  disabled?: boolean;
}) {
  const { themeColor } = useNativeTheme();
  const helper = field.ui?.helperText;

  return (
    <View
      className="mb-4"
      pointerEvents={disabled ? 'none' : 'auto'}
      style={{ opacity: disabled ? 0.72 : 1 }}
    >
      <FieldLabel field={field} />
      {field.type === 'text' ||
      field.type === 'textarea' ||
      field.type === 'number' ||
      field.type === 'date' ||
      field.type === 'time' ? (
        <TextField field={field} value={value} onChange={onChange} />
      ) : null}

      {field.type === 'dropdown' ? (
        <View className="flex-row flex-wrap gap-2">
          {asInputValue(value) &&
          !(field.options ?? []).includes(asInputValue(value)) ? (
            <OptionChip
              label={asInputValue(value)}
              active
              onPress={() => onChange(value)}
            />
          ) : null}
          {(field.options ?? []).map((option) => (
            <OptionChip
              key={option}
              label={option}
              active={asInputValue(value) === option}
              onPress={() => onChange(option)}
            />
          ))}
          {(field.options ?? []).length === 0 ? (
            <Text className="text-sm text-slate-500 dark:text-slate-400">
              No options configured.
            </Text>
          ) : null}
        </View>
      ) : null}

      {field.type === 'checkbox' ? (
        <Pressable
          onPress={() => onChange(!(value === true))}
          className="flex-row items-center gap-2.5 rounded-[14px] bg-white dark:bg-slate-800 px-3.5 py-3 border-[#dce4f0] dark:border-[#334155]"
          style={{ borderWidth: 1 }}
        >
          <Ionicons
            name={value === true ? 'checkbox' : 'square-outline'}
            size={22}
            color={themeColor(value === true ? BLUE_TEXT : MUTED)}
          />
          <Text className="flex-1 text-[14px] leading-snug text-[#182641] dark:text-[#f1f5f9]">
            Yes
          </Text>
        </Pressable>
      ) : null}

      {field.type === 'timesheet' ? (
        <TimesheetField value={value} onChange={onChange} settings={settings} />
      ) : null}

      {field.type === 'resource_usage' ? (
        <RoleResourceUsageField
          plans={
            resourcePlans || {
              equipment: [],
              materials: [],
              additionalEquipment: [],
              additionalMaterials: [],
              additionalMaterialTypes: [],
            }
          }
          equipmentUsage={
            typeof value === 'object' &&
            value !== null &&
            Array.isArray((value as { equipment?: unknown }).equipment)
              ? (value as { equipment: ResourceUsageRow[] }).equipment
              : []
          }
          materialUsage={
            typeof value === 'object' &&
            value !== null &&
            Array.isArray((value as { materials?: unknown }).materials)
              ? (value as { materials: ResourceUsageRow[] }).materials
              : []
          }
          onEquipmentChange={(equipment) =>
            onChange({
              ...(typeof value === 'object' && value !== null ? value : {}),
              equipment,
              materials:
                typeof value === 'object' &&
                value !== null &&
                Array.isArray((value as { materials?: unknown }).materials)
                  ? (value as { materials: ResourceUsageRow[] }).materials
                  : [],
            })
          }
          onMaterialChange={(materials) =>
            onChange({
              ...(typeof value === 'object' && value !== null ? value : {}),
              equipment:
                typeof value === 'object' &&
                value !== null &&
                Array.isArray((value as { equipment?: unknown }).equipment)
                  ? (value as { equipment: ResourceUsageRow[] }).equipment
                  : [],
              materials,
            })
          }
          disabled={Boolean(disabled)}
        />
      ) : null}

      {field.type === 'work_order_types' ? (
        <WorkOrderTypesField
          options={workOrderTypes ?? []}
          catalogOptions={settings?.workOrderTypeOptions ?? []}
          value={value}
          onChange={onChange}
          disabled={Boolean(disabled)}
        />
      ) : null}

      {field.type === 'signature' ? (
        <SignaturePad
          instanceId={instanceId}
          value={value}
          onChange={(signature) => onChange(signature)}
        />
      ) : null}

      {field.type === 'photo' || field.type === 'attachment' ? (
        <Pressable
          onPress={() =>
            onChange(`${field.type}_captured_${new Date().toISOString()}`)
          }
          className="items-center justify-center rounded-2xl px-3 py-6"
          style={{
            minHeight: 120,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: themeColor(value ? BLUE_BORDER : '#cfd9ea', 'border'),
            backgroundColor: themeColor(
              value ? BLUE_SOFT : '#fbfcff',
              'background',
            ),
          }}
        >
          <Ionicons
            name={field.type === 'photo' ? 'camera-outline' : 'attach-outline'}
            size={22}
            color={themeColor(value ? BLUE_TEXT : '#8090ad')}
          />
          <Text
            className="mt-2 text-center text-sm font-semibold"
            style={{ color: themeColor(value ? BLUE_TEXT : '#8090ad', 'text') }}
          >
            {value
              ? 'Captured'
              : field.type === 'photo'
                ? 'Tap to add photo'
                : 'Tap to attach file'}
          </Text>
        </Pressable>
      ) : null}

      {helper ? (
        <Text className="mt-1.5 text-[12px] leading-snug text-[#74819a] dark:text-[#94a3b8]">
          {helper}
        </Text>
      ) : null}

      {field.ui?.quickTags?.length ? (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {field.ui.quickTags.map((tag) => (
            <OptionChip
              key={tag}
              label={tag}
              active={asInputValue(value)
                .split('\n')
                .map((v) => v.trim())
                .includes(tag)}
              tone={field.ui?.tagTone ?? 'blue'}
              onPress={() => onChange(appendUniqueLine(value, tag))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function WorkOrderFormScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { token, user, hasPermission } = useAuth();
  const {
    assignmentId,
    workOrderId,
    shiftId,
    projectId,
    category,
    templateId: initialTemplateId,
    scheduledStartTime,
    scheduledEndTime,
  } = useLocalSearchParams<{
    assignmentId?: string;
    workOrderId?: string;
    shiftId?: string;
    projectId?: string;
    category?: string;
    templateId?: string;
    scheduledStartTime?: string;
    scheduledEndTime?: string;
  }>();
  const resolvedWorkOrderId = workOrderId || assignmentId || '';
  const resolvedShiftId = shiftId || '';
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialTemplateId || '',
  );
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [openingEdit, setOpeningEdit] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['mobile-company-settings', token],
    enabled: Boolean(token),
    queryFn: () => fetchCompanySettings(token as string),
  });

  const templatesQuery = useQuery({
    queryKey: [
      'mobile-form-templates',
      token,
      resolvedWorkOrderId,
      resolvedShiftId,
    ],
    enabled: Boolean(token && resolvedWorkOrderId),
    queryFn: () =>
      fetchFormTemplates({
        token: token as string,
        workOrderId: resolvedWorkOrderId,
        shiftId: resolvedShiftId || undefined,
      }),
  });

  const templates = useMemo(
    () => templatesQuery.data ?? [],
    [templatesQuery.data],
  );
  const filteredTemplates = useMemo(() => {
    const requested = categoryKey(category);
    if (!category) return templates;
    return templates.filter(
      (template) => templateCategoryKey(template, category) === requested,
    );
  }, [category, templates]);
  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find(
        (template) => template.id === selectedTemplateId,
      ) ??
      filteredTemplates[0] ??
      null,
    [selectedTemplateId, filteredTemplates],
  );
  const selectedCategory = templateCategoryKey(selectedTemplate, category);
  const timesheetScope =
    selectedCategory === 'timesheet' &&
    !roleCanSubmitFinalTimesheets(user?.role, hasPermission)
      ? 'own'
      : 'all';

  useEffect(() => {
    if (!filteredTemplates[0]) return;
    if (
      !selectedTemplateId ||
      !filteredTemplates.some((template) => template.id === selectedTemplateId)
    ) {
      setSelectedTemplateId(filteredTemplates[0].id);
    }
  }, [selectedTemplateId, filteredTemplates]);

  const previewQuery = useQuery({
    queryKey: [
      'mobile-form-context-preview',
      token,
      selectedTemplate?.id,
      resolvedWorkOrderId,
      resolvedShiftId,
      timesheetScope,
    ],
    enabled: Boolean(token && selectedTemplate?.id && resolvedWorkOrderId),
    queryFn: () =>
      fetchFormContextPreview({
        token: token as string,
        templateId: selectedTemplate?.id as string,
        workOrderId: resolvedWorkOrderId,
        shiftId: resolvedShiftId || undefined,
        timesheetScope,
      }),
  });
  const selectedFields = useMemo(
    () =>
      (selectedTemplate?.fields ?? []).filter((field) =>
        fieldVisibleForMobileRole(
          field,
          user?.role,
          Boolean(previewQuery.data?.canManageWorkOrder),
        ),
      ),
    [
      previewQuery.data?.canManageWorkOrder,
      selectedTemplate?.fields,
      user?.role,
    ],
  );
  const isViewerUser = (user?.role || '').toLowerCase() === 'viewer';
  const isAdminUser =
    user?.role === 'admin' || Boolean(user?.roles?.includes('admin'));
  const timesheetEntryLocked =
    selectedCategory === 'timesheet' &&
    isViewerUser &&
    !isAdminUser &&
    Boolean(previewQuery.data) &&
    !previewQuery.data?.canManageWorkOrder;
  const canSubmitForms =
    selectedCategory === 'timesheet'
      ? hasPermission('mobile.timesheets.submit') && !timesheetEntryLocked
      : selectedCategory === 'incident'
        ? hasPermission('mobile.incidents.submit')
        : selectedCategory === 'workorder'
          ? hasPermission('mobile.work-orders.submit') ||
            Boolean(previewQuery.data?.canManageWorkOrder)
          : hasPermission('form-submissions.write');

  const submissionsQuery = useQuery({
    queryKey: [
      'mobile-form-submissions',
      token,
      resolvedWorkOrderId,
      resolvedShiftId,
      timesheetScope,
    ],
    enabled: Boolean(token && resolvedWorkOrderId && resolvedShiftId),
    queryFn: () =>
      fetchFormSubmissions({
        token: token as string,
        workOrderId: resolvedWorkOrderId,
        shiftId: resolvedShiftId,
        timesheetScope,
      }),
  });

  useFocusEffect(
    useCallback(() => {
      if (token && resolvedWorkOrderId) void templatesQuery.refetch();
      if (token && selectedTemplate?.id && resolvedWorkOrderId)
        void previewQuery.refetch();
      if (token && resolvedWorkOrderId && resolvedShiftId)
        void submissionsQuery.refetch();
    }, [
      previewQuery,
      resolvedShiftId,
      resolvedWorkOrderId,
      selectedTemplate?.id,
      submissionsQuery,
      templatesQuery,
      token,
    ]),
  );

  const shiftSubmissions = useMemo(
    () => submissionsQuery.data ?? [],
    [submissionsQuery.data],
  );
  const existingSubmission = useMemo(() => {
    if (selectedCategory === 'timesheet' || !selectedTemplate) return null;
    const candidates = shiftSubmissions.filter(
      (submission) => submission.templateId === selectedTemplate.id,
    );
    if (selectedCategory === 'workorder') {
      const latestSubmitted = candidates
        .filter((submission) => submission.status === 'submitted')
        .sort((left, right) =>
          String(right.submittedAt || '').localeCompare(
            String(left.submittedAt || ''),
          ),
        )[0];
      // The completed Work Order always owns this template + shift. Reusing it
      // guarantees that editing/resubmitting updates the same record.
      if (latestSubmitted) return latestSubmitted;
    }
    return (
      candidates.find((submission) =>
        submissionCoversVisibleTimesheets(
          submission,
          previewQuery.data?.suggestedData,
        ),
      ) ?? null
    );
  }, [
    previewQuery.data?.suggestedData,
    selectedCategory,
    selectedTemplate,
    shiftSubmissions,
  ]);
  const submittedLocked =
    selectedCategory !== 'timesheet' &&
    existingSubmission?.status === 'submitted';
  const timesheetCompleted = useMemo(() => {
    if (selectedCategory !== 'timesheet') return false;
    return shiftSubmissions.some(
      (submission) =>
        submission.status === 'submitted' &&
        Boolean(submission.pdfUrl?.trim()) &&
        submissionHasCompletedTimesheets(
          submission,
          previewQuery.data?.suggestedData,
        ),
    );
  }, [previewQuery.data?.suggestedData, selectedCategory, shiftSubmissions]);
  const formCompleted = submittedLocked || timesheetCompleted;
  const canEditCompletedWorkOrder =
    selectedCategory === 'workorder' &&
    submittedLocked &&
    Boolean(previewQuery.data?.canEditSubmittedWorkOrder);
  const formLocked = formCompleted && !editingCompleted;

  useEffect(() => {
    setEditingCompleted(false);
  }, [resolvedShiftId, resolvedWorkOrderId, selectedTemplate?.id]);

  useEffect(() => {
    if (!canEditCompletedWorkOrder && editingCompleted) {
      setEditingCompleted(false);
    }
  }, [canEditCompletedWorkOrder, editingCompleted]);

  useEffect(() => {
    if (!selectedTemplate || !previewQuery.data || !settingsQuery.data) return;
    const existingData = existingSubmission?.data ?? {};
    const suggestedData = previewQuery.data?.suggestedData ?? {};
    const nextValues = Object.fromEntries(
      selectedFields.map((field) => {
        // While a submitted Work Order is being edited, the live timesheet
        // rows are the source of truth (web corrections included), not the
        // snapshot stored in the original submission.
        const useLiveTimesheets =
          editingCompleted && field.type === 'timesheet';
        const rawValue = formFieldValue(
          field,
          suggestedData,
          useLiveTimesheets ? {} : existingData,
          settingsQuery.data,
        );
        let value =
          field.type === 'resource_usage'
            ? initializeResourceUsage(
                rawValue,
                previewQuery.data?.resourcePlans,
              )
            : rawValue;
        if (field.type === 'timesheet') {
          value = applySelectedShiftSchedule(
            value,
            scheduledStartTime,
            scheduledEndTime,
            settingsQuery.data,
          );
          value = applyTimesheetLunchDefault(
            value,
            field.ui?.lunchTakenDefault,
            useLiveTimesheets ? undefined : existingData[field.id],
          );
        }
        return [field.id, value];
      }),
    );
    nextValues.roleEquipmentUsage = Array.isArray(
      existingData.roleEquipmentUsage,
    )
      ? existingData.roleEquipmentUsage
      : [];
    nextValues.roleMaterialUsage = Array.isArray(existingData.roleMaterialUsage)
      ? existingData.roleMaterialUsage
      : [];
    setValues(nextValues);
    setDirty(false);
  }, [
    editingCompleted,
    existingSubmission,
    previewQuery.data,
    settingsQuery.data,
    scheduledEndTime,
    scheduledStartTime,
    selectedFields,
    selectedTemplate,
    shiftSubmissions,
  ]);

  const submitMutation = useMutation({
    mutationFn: (status: 'draft' | 'submitted') => {
      if (!canSubmitForms) throw new Error('Your role cannot submit forms.');
      if (!token || !selectedTemplate)
        throw new Error('Missing form template.');
      const payload = {
        token,
        templateId: selectedTemplate.id,
        projectId,
        workOrderId: resolvedWorkOrderId,
        shiftId: resolvedShiftId || undefined,
        workerId: user?.id,
        data: values,
        status,
      };
      return existingSubmission
        ? updateFormSubmission({ ...payload, id: existingSubmission.id })
        : createFormSubmission(payload);
    },
    onSuccess: async (_, status) => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-form-submissions'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-assignment-form-submissions'],
      });
      await queryClient.invalidateQueries({ queryKey: ['mobile-assignments'] });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-assignment-detail'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-timesheet-assignments'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-shift-calendar-assignments'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-notification-assignments'],
      });
      Alert.alert(
        status === 'draft'
          ? 'Draft saved'
          : editingCompleted
            ? 'Work Order updated'
            : 'Form submitted',
        selectedTemplate?.name ?? 'Form',
      );
      router.back();
    },
    onError: (error) => {
      Alert.alert(
        'Unable to save form',
        error instanceof Error ? error.message : 'Please try again.',
      );
    },
  });

  const bottomPad = Math.max(insets.bottom, 12);
  const loading =
    settingsQuery.isLoading ||
    templatesQuery.isLoading ||
    previewQuery.isLoading ||
    submissionsQuery.isLoading;
  const error =
    templatesQuery.error ?? previewQuery.error ?? settingsQuery.error;
  const actionDisabled =
    loading ||
    Boolean(error) ||
    !selectedTemplate ||
    submitMutation.isPending ||
    openingEdit;
  const saveDisabled =
    actionDisabled ||
    !canSubmitForms ||
    (formCompleted && !editingCompleted && !canEditCompletedWorkOrder);
  const submitDisabled =
    actionDisabled || !canSubmitForms || (formCompleted && !editingCompleted);

  const setFieldValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setDirty(true);
  };

  const startEditingCompleted = async () => {
    if (!token || !selectedTemplate || !existingSubmission) return;
    setOpeningEdit(true);
    try {
      const result = await reopenFormSubmissionForEdit({
        token,
        id: existingSubmission.id,
        templateId: selectedTemplate.id,
        workOrderId: resolvedWorkOrderId,
        shiftId: resolvedShiftId || undefined,
      });
      if (!result.canEdit) {
        Alert.alert(
          'Edit not available',
          'This Work Order cannot be edited right now.',
        );
        return;
      }
      setEditingCompleted(true);
    } catch (error) {
      Alert.alert(
        'Unable to edit Work Order',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setOpeningEdit(false);
    }
  };

  const cancelEditingCompleted = () => {
    setEditingCompleted(false);
    setDirty(false);
  };

  const handleSubmit = (status: 'draft' | 'submitted') => {
    if (loading || error || !settingsQuery.data) return;
    if (!selectedTemplate) return;
    if (!canSubmitForms) {
      Alert.alert(
        'Read-only access',
        'Your role can view this form, but cannot save or submit it.',
      );
      return;
    }
    if (formCompleted && !editingCompleted) {
      Alert.alert(
        'Already submitted',
        selectedCategory === 'timesheet'
          ? 'The timesheet rows for this shift were already completed from the Timesheet or Work Order form.'
          : 'This form has already been submitted for this shift. Delete the submission on web before sending it again.',
      );
      return;
    }
    if (status === 'submitted') {
      const missing = selectedFields.filter(
        (field) => field.required && isEmpty(values[field.id]),
      );
      if (missing.length > 0) {
        Alert.alert(
          'Missing required fields',
          missing.map(mobileFieldLabel).join(', '),
        );
        return;
      }
      const timesheetError = selectedFields
        .filter((field) => field.type === 'timesheet')
        .flatMap((field) => asTimesheetRows(values[field.id]))
        .map((row) => timesheetTimeError(row, settingsQuery.data))
        .find(Boolean);
      if (timesheetError) {
        Alert.alert('Invalid timesheet time', timesheetError);
        return;
      }
      const incompleteTimesheets = selectedFields.filter((field) => {
        if (field.type !== 'timesheet') return false;
        const rows = asTimesheetRows(values[field.id]);
        return rows.some((row) => row.status !== 'completed');
      });
      if (incompleteTimesheets.length > 0) {
        Alert.alert(
          'Incomplete timesheets',
          'Complete every worker timesheet before submitting.',
        );
        return;
      }
    }
    submitMutation.mutate(status);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-[#eef3fb] dark:bg-[#0f172a]"
    >
      <StatusBar style="light" backgroundColor="#1c2e4a" translucent={false} />
      <PageHeader
        title={selectedTemplate?.name ?? 'Work Order Form'}
        subtitle="Assignment Form"
      />

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 104 + bottomPad,
        }}
      >
        <Card>
          <Text className="text-[18px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
            {selectedTemplate?.name ?? 'Select a form'}
          </Text>
          {!canSubmitForms ? (
            <View
              className={`mt-3 rounded-2xl border p-3 ${
                timesheetEntryLocked
                  ? 'border-amber-200 dark:border-[#92400e] bg-amber-50 dark:bg-[#451a03]'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  timesheetEntryLocked
                    ? 'text-amber-800 dark:text-[#fcd34d]'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {timesheetEntryLocked ? 'Timesheet locked' : 'Read-only access'}
              </Text>
              <Text
                className={`mt-1 text-xs leading-5 ${
                  timesheetEntryLocked
                    ? 'text-amber-700 dark:text-[#fcd34d]'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {timesheetEntryLocked
                  ? 'Only the Work Order manager or an administrator can enter timesheet hours for this shift.'
                  : 'Your role can view assignment forms, but cannot save drafts or submit responses.'}
              </Text>
            </View>
          ) : null}
          {editingCompleted ? (
            <View className="mt-3 rounded-2xl border border-amber-200 dark:border-[#92400e] bg-amber-50 dark:bg-[#451a03] p-3">
              <Text className="text-sm font-bold text-amber-800 dark:text-[#fcd34d]">
                Editing submitted Work Order
              </Text>
              <Text className="mt-1 text-xs leading-5 text-amber-700 dark:text-[#fcd34d]">
                Changes update this same submission, including its timesheets
                and PDF. Tap Resubmit when you are done.
              </Text>
            </View>
          ) : formCompleted && canEditCompletedWorkOrder ? (
            <View className="mt-3 rounded-2xl border border-blue-200 dark:border-[#1e40af] bg-blue-50 dark:bg-[#172554] p-3">
              <Text className="text-sm font-bold text-blue-800 dark:text-[#93c5fd]">
                Completed Work Order
              </Text>
              <Text className="mt-1 text-xs leading-5 text-blue-700 dark:text-[#93c5fd]">
                Tap Edit to update the Work Order and its timesheets. The same
                submission is updated, then you can resubmit it.
              </Text>
            </View>
          ) : formCompleted ? (
            <View className="mt-3 rounded-2xl border border-emerald-200 dark:border-[#065f46] bg-emerald-50 dark:bg-[#022c22] p-3">
              <Text className="text-sm font-bold text-emerald-800 dark:text-[#6ee7b7]">
                Already submitted
              </Text>
              <Text className="mt-1 text-xs leading-5 text-emerald-700 dark:text-[#6ee7b7]">
                {selectedCategory === 'timesheet'
                  ? 'The timesheet rows for this shift were already completed from the Timesheet or Work Order form.'
                  : selectedCategory === 'workorder'
                    ? 'This Work Order is locked. Only the Work Order manager or an administrator can edit it, and only before the shift is PM approved.'
                    : 'This shift already has a submitted response for this form. Delete that submission on web to enable sending it again.'}
              </Text>
            </View>
          ) : null}
          <Text className="mt-1 text-[13px] leading-[1.45] text-[#74819a] dark:text-[#94a3b8]">
            {selectedTemplate?.description ||
              `Assignment ${resolvedWorkOrderId || '-'}`}
          </Text>
          {filteredTemplates.length > 1 ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {filteredTemplates.map((template) => (
                <OptionChip
                  key={template.id}
                  label={template.name}
                  active={selectedTemplate?.id === template.id}
                  tone="slate"
                  onPress={() => {
                    setSelectedTemplateId(template.id);
                    setDirty(false);
                  }}
                />
              ))}
            </View>
          ) : null}
        </Card>

        {loading ? (
          <Card>
            <View className="items-center py-6">
              <ActivityIndicator color="#CC0000" />
              <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Loading form...
              </Text>
            </View>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <Text className="text-base font-bold text-red-700 dark:text-[#fca5a5]">
              Unable to load form
            </Text>
            <Text className="mt-1 text-sm text-slate-600 dark:text-slate-200">
              {error instanceof Error ? error.message : 'Please try again.'}
            </Text>
          </Card>
        ) : null}

        {!loading && !error && filteredTemplates.length === 0 ? (
          <Card>
            <Text className="text-base font-bold text-slate-800 dark:text-slate-100">
              No forms assigned
            </Text>
            <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              This assignment does not have a matching form template yet.
            </Text>
          </Card>
        ) : null}

        {!loading && selectedTemplate ? (
          <Card>
            {selectedFields.map((field, index) => {
              const startsSection =
                field.ui?.section &&
                field.ui.section !== selectedFields[index - 1]?.ui?.section;
              return (
                <View key={`${selectedTemplate.id}:${field.id}`}>
                  {startsSection ? (
                    <View className="mb-3 border-t border-slate-100 dark:border-slate-700 pt-3">
                      <Text className="text-[20px] font-extrabold text-[#182641] dark:text-[#f1f5f9]">
                        {field.ui?.section}
                      </Text>
                      {field.ui?.sectionDescription ? (
                        <Text className="mt-1 text-[13px] text-[#74819a] dark:text-[#94a3b8]">
                          {field.ui.sectionDescription}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  <DynamicField
                    field={field}
                    value={values[field.id]}
                    onChange={(value) => setFieldValue(field.id, value)}
                    settings={settingsQuery.data}
                    instanceId={`${selectedTemplate.id}:${field.id}`}
                    resourcePlans={previewQuery.data?.resourcePlans}
                    workOrderTypes={previewQuery.data?.workOrderTypes}
                    disabled={
                      formLocked ||
                      !canSubmitForms ||
                      Boolean(
                        field.dataBinding?.path &&
                        field.dataBinding.editable === false &&
                        Object.prototype.hasOwnProperty.call(
                          previewQuery.data?.suggestedData ?? {},
                          field.id,
                        ),
                      )
                    }
                  />
                </View>
              );
            })}
            {selectedFields.length === 0 ? (
              <Text className="text-sm text-slate-500 dark:text-slate-400">
                This template has no fields configured.
              </Text>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 px-4 pt-3 bg-[#eef3fb] dark:bg-[#0f172a]"
        style={{
          paddingBottom: bottomPad,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 8,
        }}
      >
        <View className="flex-row gap-2.5">
          <Pressable
            disabled={saveDisabled}
            onPress={() => {
              if (editingCompleted) {
                cancelEditingCompleted();
                return;
              }
              if (canEditCompletedWorkOrder) {
                void startEditingCompleted();
                return;
              }
              handleSubmit('draft');
            }}
            className={`flex-1 items-center rounded-2xl py-4 ${
              canEditCompletedWorkOrder && !editingCompleted
                ? 'bg-[#2f62e6]'
                : 'bg-[#e9eef7] dark:bg-[#334155]'
            }`}
            style={{ opacity: saveDisabled ? 0.6 : 1 }}
          >
            <Text
              className={`text-sm font-extrabold ${
                canEditCompletedWorkOrder && !editingCompleted
                  ? 'text-white'
                  : 'text-[#42506a] dark:text-[#cbd5e1]'
              }`}
            >
              {openingEdit
                ? 'Opening...'
                : editingCompleted
                  ? 'Cancel'
                  : selectedCategory === 'workorder' && submittedLocked
                    ? 'Edit'
                    : 'Save Draft'}
            </Text>
          </Pressable>
          <Pressable
            disabled={submitDisabled}
            onPress={() => handleSubmit('submitted')}
            className="flex-1 items-center rounded-2xl py-4 bg-[#CC0000]"
            style={{ opacity: submitDisabled ? 0.6 : 1 }}
          >
            <Text className="text-sm font-extrabold text-white">
              {submitMutation.isPending
                ? 'Saving...'
                : editingCompleted
                  ? 'Resubmit'
                  : formCompleted
                    ? 'Submitted'
                    : 'Submit Form'}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
