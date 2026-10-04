import { useQuery } from '@tanstack/react-query';

import { getTicket, listAllTickets, listMyTickets } from '../../../services/hr/tickets';
import { useSessionStore } from '../../../store/sessionStore';

export const supportKeys = {
  all: ['hr', 'tickets'] as const,
  list: (support: boolean) => ['hr', 'tickets', 'list', support] as const,
  ticket: (id: string) => ['hr', 'tickets', 'ticket', id] as const,
};

/** SuperAdmin sees every ticket; everyone else sees their own. Loaded when the page opens, never on a timer. */
export function useTickets(support: boolean, enabled: boolean) {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: supportKeys.list(support),
    queryFn: () => (support ? listAllTickets(accessToken!) : listMyTickets(accessToken!)),
    enabled: Boolean(accessToken) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useTicket(ticketId: string) {
  const accessToken = useSessionStore((state) => state.accessToken);
  return useQuery({
    queryKey: supportKeys.ticket(ticketId),
    queryFn: () => getTicket(accessToken!, ticketId),
    enabled: Boolean(accessToken) && Boolean(ticketId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}
