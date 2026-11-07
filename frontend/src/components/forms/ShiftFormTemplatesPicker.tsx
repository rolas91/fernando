import React, { useMemo } from 'react';
import type { FormTemplate } from '@/lib/types';

type Props = {
  formTemplates: FormTemplate[];
  value: string[];
  onChange: (ids: string[]) => void;
  idAttr?: string;
  disabled?: boolean;
};

const ShiftFormTemplatesPicker: React.FC<Props> = ({
  formTemplates,
  value,
  onChange,
  idAttr,
  disabled = false,
}) => {
  const sorted = useMemo(
    () =>
      [...formTemplates].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [formTemplates],
  );

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={idAttr}
        className="block text-xs font-semibold text-gray-600"
      >
        Forms on this shift
      </label>
      <p className="text-[11px] leading-snug text-gray-500">
        Choose the forms the mobile app should offer for this shift. Each shift
        keeps its own selection.
      </p>
      <div
        id={idAttr}
        className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2"
      >
        {sorted.map((template) => {
          const selected = value.includes(template.id);
          return (
            <button
              key={template.id}
              type="button"
              disabled={disabled}
              title={template.description || template.category}
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((id) => id !== template.id)
                    : [...value, template.id],
                )
              }
              className={`max-w-[220px] truncate rounded-md px-2 py-1 text-[11px] font-medium disabled:cursor-default ${
                selected
                  ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-300'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {template.name}
            </button>
          );
        })}
        {sorted.length === 0 ? (
          <span className="py-1 text-xs text-gray-400">
            No templates yet. Create them in Forms.
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default ShiftFormTemplatesPicker;
