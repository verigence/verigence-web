export const leaveKeys = {
  all: ['hr', 'leave'] as const,
  myBalance: (year: number) => ['hr', 'leave', 'my-balance', year] as const,
  myRequests: ['hr', 'leave', 'my-requests'] as const,
  holidays: (year: number) => ['hr', 'leave', 'holidays', year] as const,
  overview: (year: number) => ['hr', 'leave', 'overview', year] as const,
  employee: (id: string, year: number) => ['hr', 'leave', 'employee', id, year] as const,
};

/** Years offered in the balance pickers: last year, this year and next year. */
export function yearChoices(currentYear: number): number[] {
  return [currentYear - 1, currentYear, currentYear + 1];
}
