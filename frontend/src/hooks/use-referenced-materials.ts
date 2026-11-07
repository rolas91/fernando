import { useEffect, useState } from 'react';
import { dbFetchMaterial } from '@/lib/db';
import type { Material } from '@/lib/types';

/** Resolve existing references without putting archived materials back in the catalog. */
export function useReferencedMaterials(catalog: Material[], ids: string[]) {
  const [references, setReferences] = useState<Material[]>([]);
  const missingKey = JSON.stringify(
    [...new Set(ids)]
      .filter((id) => !catalog.some((item) => item.id === id))
      .sort(),
  );
  useEffect(() => {
    let cancelled = false;
    const missing = JSON.parse(missingKey) as string[];
    void Promise.all(
      missing.map((id) => dbFetchMaterial(id).catch(() => null)),
    ).then((items) => {
      if (!cancelled)
        setReferences(items.filter((item): item is Material => item !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);
  return [
    ...catalog,
    ...references.filter(
      (item) =>
        ids.includes(item.id) &&
        !catalog.some((active) => active.id === item.id),
    ),
  ];
}
