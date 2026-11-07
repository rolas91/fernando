import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Sparkles, X } from 'lucide-react';
import type { Certification, Skill } from '@/lib/types';

type CatalogOption = {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
};

const CatalogMultiSelect: React.FC<{
  items: CatalogOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  tone?: 'amber' | 'purple';
}> = ({
  items,
  selectedIds,
  onChange,
  label,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  tone = 'amber',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeItems = useMemo(
    () => items.filter((item) => item.status === 'active'),
    [items],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeItems;
    return activeItems.filter((item) => {
      const haystack = `${item.name} ${item.description || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeItems, search]);

  const toggleItem = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
      return;
    }
    onChange([...selectedIds, id]);
  };

  const chipClass =
    tone === 'purple'
      ? 'bg-purple-50 text-purple-700'
      : 'bg-amber-50 text-amber-700';
  const iconClass =
    tone === 'purple'
      ? 'text-purple-600 hover:text-purple-800'
      : 'text-amber-600 hover:text-amber-800';
  const selectedClass = tone === 'purple' ? 'bg-purple-50' : 'bg-amber-50';
  const checkClass =
    tone === 'purple'
      ? 'border-purple-600 bg-purple-600 text-white'
      : 'border-amber-600 bg-amber-600 text-white';

  return (
    <div className="relative">
      {label ? (
        <label className="mb-1 block text-xs font-semibold text-gray-600">
          {label}
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-300 px-3 py-2 text-left text-sm"
      >
        <div className="flex min-h-5 flex-wrap gap-1.5">
          {selectedItems.length > 0 ? (
            selectedItems.map((item) => (
              <span
                key={item.id}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${chipClass}`}
              >
                <Sparkles size={11} />
                {item.name}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleItem(item.id);
                  }}
                  className={iconClass}
                  aria-label={`Remove ${item.name}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronsUpDown size={16} className="flex-shrink-0 text-gray-400" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-2">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 ${
                      selected ? selectedClass : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {item.name}
                      </p>
                      {item.description ? (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? checkClass
                          : 'border-gray-300 text-transparent'
                      }`}
                    >
                      <Check size={12} />
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-sm text-gray-500">{emptyMessage}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const SkillMultiSelect: React.FC<{
  skills: Skill[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
}> = ({
  skills,
  selectedIds,
  onChange,
  label,
  placeholder = 'Select skills...',
}) => (
  <CatalogMultiSelect
    items={skills}
    selectedIds={selectedIds}
    onChange={onChange}
    label={label}
    placeholder={placeholder}
    searchPlaceholder="Search skills..."
    emptyMessage="No active skills found."
  />
);

export const CertificationMultiSelect: React.FC<{
  certifications: Certification[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
}> = ({
  certifications,
  selectedIds,
  onChange,
  label,
  placeholder = 'Select certifications...',
}) => (
  <CatalogMultiSelect
    items={certifications}
    selectedIds={selectedIds}
    onChange={onChange}
    label={label}
    placeholder={placeholder}
    searchPlaceholder="Search certifications..."
    emptyMessage="No active certifications found."
    tone="purple"
  />
);
