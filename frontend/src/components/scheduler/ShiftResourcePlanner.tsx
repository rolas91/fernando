import React from 'react';
import {
  Check,
  ChevronDown,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react';
import type { Material } from '@/lib/types';
import { useReferencedMaterials } from '@/hooks/use-referenced-materials';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type PlannedResource = {
  type: string;
  estimatedQuantity: number;
  materialIds?: string[];
  materialQuantities?: Record<string, number>;
};

type Props = {
  equipment: PlannedResource[];
  materials: PlannedResource[];
  equipmentOptions: string[];
  materialOptions: string[];
  materialCatalog?: Material[];
  disabled?: boolean;
  onEquipmentChange: React.Dispatch<React.SetStateAction<PlannedResource[]>>;
  onMaterialsChange: React.Dispatch<React.SetStateAction<PlannedResource[]>>;
};

function MaterialMultiSelect({
  materials,
  selectedIds,
  quantities,
  disabled,
  onChange,
}: {
  materials: Material[];
  selectedIds: string[];
  quantities: Record<string, number>;
  disabled?: boolean;
  onChange: (ids: string[], quantities: Record<string, number>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [draftIds, setDraftIds] = React.useState<string[]>(selectedIds);
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const referencedMaterials = useReferencedMaterials(materials, selectedIds);
  const draftSet = React.useMemo(() => new Set(draftIds), [draftIds]);
  const filteredMaterials = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return materials
      .filter(
        (material) =>
          !query ||
          `${material.id} ${material.name} ${material.identifier || ''} ${material.sku || ''}`
            .toLocaleLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          Number(draftSet.has(b.id)) - Number(draftSet.has(a.id)) ||
          `${a.name} ${a.identifier}`.localeCompare(
            `${b.name} ${b.identifier}`,
          ),
      );
  }, [draftSet, materials, search]);
  const selectedMaterials = referencedMaterials.filter((material) =>
    selectedSet.has(material.id),
  );
  const selectedSummary =
    selectedMaterials.length === 0
      ? 'Choose materials...'
      : `${selectedMaterials
          .slice(0, 2)
          .map((material) => material.name)
          .join(
            ', ',
          )}${selectedMaterials.length > 2 ? ` +${selectedMaterials.length - 2} more` : ''}`;
  const allVisibleSelected =
    filteredMaterials.length > 0 &&
    filteredMaterials.every((material) => draftSet.has(material.id));

  const setPopoverOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftIds(selectedIds);
      setSearch('');
    }
    setOpen(nextOpen);
  };
  const toggleDraftMaterial = (materialId: string) => {
    setDraftIds((current) =>
      current.includes(materialId)
        ? current.filter((id) => id !== materialId)
        : [...current, materialId],
    );
  };
  const updateQuantity = (materialId: string, quantity: number) => {
    onChange(selectedIds, {
      ...quantities,
      [materialId]: Math.max(1, Math.floor(quantity) || 1),
    });
  };

  return (
    <Popover open={open} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || materials.length === 0}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-purple-200 bg-purple-50/40 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-purple-700">
              {selectedIds.length} selected
            </span>
            <span className="block truncate text-xs text-gray-600">
              {materials.length === 0
                ? 'No active materials match this type.'
                : selectedSummary}
            </span>
          </span>
          <ChevronDown size={15} className="shrink-0 text-purple-600" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[20rem] p-0"
      >
        <div className="border-b border-gray-100 p-3">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by material name or ID..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-gray-500">{draftIds.length} selected</span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDraftIds([])}
                className="font-semibold text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={filteredMaterials.length === 0}
                onClick={() =>
                  setDraftIds((current) => {
                    const visibleIds = new Set(
                      filteredMaterials.map((material) => material.id),
                    );
                    return allVisibleSelected
                      ? current.filter((id) => !visibleIds.has(id))
                      : Array.from(new Set([...current, ...visibleIds]));
                  })
                }
                className="font-semibold text-purple-700 disabled:opacity-40"
              >
                {allVisibleSelected ? 'Clear visible' : 'Select visible'}
              </button>
            </span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2">
          {filteredMaterials.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-gray-500">
              No materials match this search.
            </p>
          ) : (
            filteredMaterials.map((material) => {
              const selected = draftSet.has(material.id);
              return (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => toggleDraftMaterial(material.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xs hover:bg-purple-50 ${selected ? 'bg-purple-50/70' : ''}`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 bg-white'}`}
                  >
                    {selected ? <Check size={12} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gray-800">
                      {material.name}
                    </span>
                    <span className="block truncate text-gray-500">
                      {material.sku || material.identifier || material.id}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const nextQuantities = Object.fromEntries(
                draftIds.map((id) => [id, Math.max(1, quantities[id] || 1)]),
              );
              onChange(draftIds, nextQuantities);
              setOpen(false);
            }}
            className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700"
          >
            Apply
          </button>
        </div>
      </PopoverContent>
      {selectedMaterials.length > 0 && (
        <div className="mt-2 space-y-2">
          {selectedMaterials.map((material) => {
            const quantity = Math.max(1, quantities[material.id] || 1);
            return (
              <div
                key={material.id}
                className="grid grid-cols-[1fr_8rem] items-center gap-3 rounded-lg border border-purple-100 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-gray-800">
                    {material.name}
                  </div>
                  <div className="truncate text-[10px] text-gray-500">
                    {material.sku || material.identifier || material.id}
                  </div>
                </div>
                <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <button
                    type="button"
                    disabled={disabled || quantity <= 1}
                    onClick={() => updateQuantity(material.id, quantity - 1)}
                    className="p-2 text-gray-500 disabled:opacity-40"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    disabled={disabled}
                    aria-label={`Quantity for ${material.name}`}
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) =>
                      updateQuantity(
                        material.id,
                        Number.parseInt(event.target.value, 10),
                      )
                    }
                    className="w-full border-x border-gray-200 text-center text-xs font-semibold outline-none disabled:bg-gray-100"
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => updateQuantity(material.id, quantity + 1)}
                    className="p-2 text-purple-600 disabled:opacity-40"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

function ResourceSection({
  kind,
  rows,
  options,
  materialCatalog = [],
  disabled,
  onChange,
}: {
  kind: 'equipment' | 'materials';
  rows: PlannedResource[];
  options: string[];
  materialCatalog?: Material[];
  disabled?: boolean;
  onChange: React.Dispatch<React.SetStateAction<PlannedResource[]>>;
}) {
  const equipment = kind === 'equipment';
  const label = equipment ? 'Equipment' : 'Materials';
  const accent = equipment
    ? 'text-blue-600 bg-blue-50'
    : 'text-purple-600 bg-purple-50';
  const Icon = equipment ? Truck : Package;
  const update = (index: number, patch: Partial<PlannedResource>) =>
    onChange((currentRows) =>
      currentRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  const materialsForType = (type: string) => {
    const normalizedType = type.trim().toLocaleLowerCase();
    if (!normalizedType) return [];
    return materialCatalog
      .filter(
        (material) =>
          material.status !== 'retired' &&
          material.type.trim().toLocaleLowerCase() === normalizedType,
      )
      .sort((a, b) =>
        `${a.name} ${a.identifier}`.localeCompare(`${b.name} ${b.identifier}`),
      );
  };
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3">
        <span className={`rounded-lg p-2 ${accent}`}>
          <Icon size={16} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-gray-800">{label}</h3>
          <p className="text-[11px] text-gray-500">
            {equipment
              ? 'Add the equipment types the crew is expected to use, along with the estimated quantity.'
              : 'Add each material type, set the estimated quantity, and choose the catalog materials to preload in mobile.'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_9rem_2rem] gap-3 bg-gray-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        <span>{equipment ? 'Equipment' : 'Material'} Type</span>
        <span className="text-center">Estimated Qty</span>
        <span />
      </div>
      {rows.map((row, index) => {
        const matchingMaterials = equipment ? [] : materialsForType(row.type);
        const selectedMaterialIds =
          row.materialIds === undefined
            ? matchingMaterials.map((material) => material.id)
            : row.materialIds;
        const materialQuantities = Object.fromEntries(
          selectedMaterialIds.map((id) => [
            id,
            Math.max(1, row.materialQuantities?.[id] || 1),
          ]),
        );
        const selectedMaterialTotal = selectedMaterialIds.reduce(
          (total, id) => total + Math.max(1, materialQuantities[id] || 1),
          0,
        );
        return (
          <div
            key={`${kind}-${index}`}
            className="border-t border-gray-100 px-4 py-2"
          >
            <div className="grid grid-cols-[1fr_9rem_2rem] items-center gap-3">
              <div className="relative min-w-0">
                <input
                  disabled={disabled}
                  list={`${kind}-type-options-${index}`}
                  value={row.type}
                  onChange={(e) =>
                    update(index, {
                      type: e.target.value,
                      ...(equipment
                        ? {}
                        : { materialIds: [], materialQuantities: {} }),
                    })
                  }
                  placeholder="Select or enter a type..."
                  className="w-full min-w-0 rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-sm disabled:bg-gray-100 [&::-webkit-calendar-picker-indicator]:opacity-0"
                />
                <ChevronDown
                  size={15}
                  aria-hidden
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${
                    disabled ? 'text-gray-300' : 'text-gray-500'
                  }`}
                />
                <datalist id={`${kind}-type-options-${index}`}>
                  {options
                    .filter(
                      (option) =>
                        !rows.some(
                          (item, i) => i !== index && item.type === option,
                        ),
                    )
                    .map((option) => (
                      <option key={option} value={option} />
                    ))}
                </datalist>
              </div>
              {!equipment && selectedMaterialIds.length > 0 ? (
                <div
                  className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-center text-sm font-semibold text-purple-700"
                  title="Sum of selected material quantities"
                >
                  {selectedMaterialTotal}
                </div>
              ) : (
                <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <button
                    type="button"
                    disabled={disabled || row.estimatedQuantity <= 1}
                    onClick={() =>
                      update(index, {
                        estimatedQuantity: Math.max(
                          1,
                          row.estimatedQuantity - 1,
                        ),
                      })
                    }
                    className="p-2 text-gray-500 disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    disabled={disabled}
                    type="number"
                    min={1}
                    value={row.estimatedQuantity}
                    onChange={(e) =>
                      update(index, {
                        estimatedQuantity: Math.max(
                          1,
                          Number.parseInt(e.target.value, 10) || 1,
                        ),
                      })
                    }
                    className="w-full border-x border-gray-200 text-center text-sm font-semibold outline-none disabled:bg-gray-100"
                  />
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      update(index, {
                        estimatedQuantity: row.estimatedQuantity + 1,
                      })
                    }
                    className="p-2 text-blue-600 disabled:opacity-40"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange((currentRows) =>
                    currentRows.filter((_, i) => i !== index),
                  )
                }
                className="p-1 text-red-500 disabled:opacity-40"
                aria-label={`Remove ${label} row`}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {!equipment && row.type.trim() && (
              <div className="mt-2">
                <MaterialMultiSelect
                  materials={matchingMaterials}
                  selectedIds={selectedMaterialIds}
                  quantities={materialQuantities}
                  disabled={disabled}
                  onChange={(materialIds, materialQuantities) =>
                    update(index, {
                      materialIds,
                      materialQuantities,
                      estimatedQuantity:
                        materialIds.reduce(
                          (total, id) =>
                            total + Math.max(1, materialQuantities[id] || 1),
                          0,
                        ) || 1,
                    })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
      {!disabled && (
        <button
          type="button"
          onClick={() =>
            onChange((currentRows) => [
              ...currentRows,
              {
                type: '',
                estimatedQuantity: 1,
                ...(equipment ? {} : { materialIds: [] }),
              },
            ])
          }
          className="m-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"
        >
          <Plus size={14} /> Add {equipment ? 'Equipment' : 'Material'} Type
        </button>
      )}
    </section>
  );
}

export const ShiftResourcePlanner: React.FC<Props> = (props) => (
  <div className="space-y-3">
    <ResourceSection
      kind="equipment"
      rows={props.equipment}
      options={props.equipmentOptions}
      disabled={props.disabled}
      onChange={props.onEquipmentChange}
    />
    <ResourceSection
      kind="materials"
      rows={props.materials}
      options={props.materialOptions}
      materialCatalog={props.materialCatalog}
      disabled={props.disabled}
      onChange={props.onMaterialsChange}
    />
  </div>
);
