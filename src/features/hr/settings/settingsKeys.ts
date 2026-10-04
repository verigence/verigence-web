export const settingsKeys = {
  settings: ['hr', 'settings'] as const,
  holidays: (year: number) => ['hr', 'holidays', year] as const,
  holidaysAll: ['hr', 'holidays'] as const,
  categories: ['hr', 'claim-categories'] as const,
  workContext: ['hr', 'work-context'] as const,
};
