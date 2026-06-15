import { countsTowardShiftCompletion } from './work-orders.service';

describe('countsTowardShiftCompletion', () => {
  it('counts a submitted shift form even when no PDF is generated', () => {
    expect(
      countsTowardShiftCompletion({
        shiftId: 'shift-1',
        status: 'submitted',
        pdfUrl: '',
      }),
    ).toBe(true);
  });

  it('does not count drafts or submissions without a shift', () => {
    expect(
      countsTowardShiftCompletion({
        shiftId: 'shift-1',
        status: 'draft',
        pdfUrl: '',
      }),
    ).toBe(false);
    expect(
      countsTowardShiftCompletion({
        shiftId: null,
        status: 'submitted',
        pdfUrl: '',
      }),
    ).toBe(false);
  });
});
