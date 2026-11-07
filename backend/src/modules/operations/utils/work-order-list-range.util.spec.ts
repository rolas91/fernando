import { normalizeWorkOrderListRange } from './work-order-list-range.util';

describe('work order list range', () => {
  it('preserves the unfiltered endpoint when no range is requested', () => {
    expect(normalizeWorkOrderListRange()).toBeUndefined();
    expect(normalizeWorkOrderListRange({})).toBeUndefined();
  });
  it('accepts inclusive single-day and leap-year ranges', () => {
    expect(normalizeWorkOrderListRange({ from: '2026-11-13', to: '2026-11-13' })).toEqual({ from: '2026-11-13', to: '2026-11-13' });
    expect(normalizeWorkOrderListRange({ from: '2028-02-29', to: '2028-03-01' })).toBeDefined();
  });
  it.each([
    { from: '2026-11-13' }, { to: '2026-11-13' },
    { from: '', to: '' }, { from: '0000-01-01', to: '0001-01-01' }, { from: ['2026-11-13'], to: '2026-11-13' },
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-11-14', to: '2026-11-13' },
    { from: '2026-11-13T00:00:00Z', to: '2026-11-14' },
    { from: '2026-11-31', to: '2026-12-01' },
  ])('rejects invalid, partial and reversed ranges: %p', (range) => {
    expect(() => normalizeWorkOrderListRange(range)).toThrow('valid from/to date range');
  });
});
