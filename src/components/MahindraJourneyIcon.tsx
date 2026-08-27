type MahindraJourneyIconVariant = 'booking' | 'review' | 'delivery' | 'vehicle';

type MahindraJourneyIconProps = {
  variant?: MahindraJourneyIconVariant;
  className?: string;
  title?: string;
};

/**
 * Lightweight Mahindra-inspired SUV iconography for the PC journey.
 *
 * These are intentionally stylized, non-logo and non-model-specific silhouettes:
 * upright SUV stance, pronounced wheel arches and a confident front profile. The
 * component is inline SVG so Web and Capacitor reuse it without image/network cost.
 */
export default function MahindraJourneyIcon({
  variant = 'vehicle',
  className = '',
  title,
}: MahindraJourneyIconProps) {
  const labelled = Boolean(title);

  return (
    <svg
      className={`mahindra-journey-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 72 40"
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="mahindra-journey-icon__body"
        d="M7.5 25.5 11 17.8c.8-1.8 2.3-3.1 4.2-3.6l11.2-3.1c1.6-.4 3.3-.5 4.9-.2l12.2 2.2c1.8.3 3.4 1.2 4.6 2.6l4.5 5.2 7.3 1.8c2.7.7 4.6 3.1 4.6 5.9v1.6H61a6.3 6.3 0 0 0-12.1 0H25a6.3 6.3 0 0 0-12.1 0H8.7a2.7 2.7 0 0 1-2.7-2.7c0-.7.2-1.4.5-2Z"
      />
      <path className="mahindra-journey-icon__window" d="m17.2 17.7 10.3-2.9v7H14.8l2.4-4.1Zm14.3-3.4 10.9 2c1.1.2 2.1.7 2.9 1.6l3.2 3.8h-17V14.3Z" />
      <path className="mahindra-journey-icon__detail" d="M29.3 12.2h10.6M52.2 23.2h7.2M9.8 23h4.4" />
      <circle className="mahindra-journey-icon__wheel" cx="19" cy="30.2" r="4.4" />
      <circle className="mahindra-journey-icon__wheel" cx="55" cy="30.2" r="4.4" />
      <circle className="mahindra-journey-icon__hub" cx="19" cy="30.2" r="1.7" />
      <circle className="mahindra-journey-icon__hub" cx="55" cy="30.2" r="1.7" />

      {variant === 'booking' && (
        <g className="mahindra-journey-icon__accent">
          <path d="M48.5 4.5h10l4 4v10.4H48.5V4.5Z" />
          <path d="M58.5 4.8v4h3.7M52.2 12h6.2M52.2 15h4.5" />
        </g>
      )}

      {variant === 'review' && (
        <g className="mahindra-journey-icon__accent">
          <circle cx="55" cy="9.5" r="5.2" />
          <path d="m58.8 13.3 4.4 4.4" />
        </g>
      )}

      {variant === 'delivery' && (
        <g className="mahindra-journey-icon__accent">
          <circle cx="56" cy="9.5" r="6" />
          <path d="m52.8 9.6 2.1 2.2 4.3-4.5" />
        </g>
      )}
    </svg>
  );
}
