import type { ComponentProps } from 'react';
import { IonButton } from '@ionic/react';

type Props = ComponentProps<typeof IonButton>;

export default function VerigenceButton({ className = '', ...props }: Props) {
  return <IonButton className={`verigence-button ${className}`.trim()} {...props} />;
}
