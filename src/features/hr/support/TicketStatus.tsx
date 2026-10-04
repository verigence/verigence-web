import { ticketStatusLabels, type TicketStatus as Status } from '../../../services/hr/tickets';

const tone: Record<Status, string> = { OPEN: 'suspended', IN_PROGRESS: 'pending', CLOSED: 'active' };

export default function TicketStatus({ status }: { status: Status }) {
  return <span className={`uc01-admin-status uc01-admin-status--${tone[status]}`}>{ticketStatusLabels[status]}</span>;
}
