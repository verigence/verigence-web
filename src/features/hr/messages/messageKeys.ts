export const messageKeys = {
  templates: ['hr', 'messages', 'templates'] as const,
  recipients: (query: string) => ['hr', 'messages', 'recipients', query] as const,
  logAll: ['hr', 'messages', 'log'] as const,
  log: ['hr', 'messages', 'log', 'recent'] as const,
};
