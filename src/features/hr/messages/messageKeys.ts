export const messageKeys = {
  templates: ['hr', 'messages', 'templates'] as const,
  recipients: (query: string) => ['hr', 'messages', 'recipients', query] as const,
  logAll: ['hr', 'messages', 'log'] as const,
  log: (employeeId: string) => ['hr', 'messages', 'log', employeeId || 'everyone'] as const,
  people: (query: string) => ['hr', 'messages', 'people', query] as const,
};
