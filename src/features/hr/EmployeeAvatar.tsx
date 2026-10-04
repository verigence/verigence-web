import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchEmployeePhoto, fetchMyPhoto } from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import { hrKeys } from './hrQueries';

export function initialsOf(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
  return (tokens[0] || '?').slice(0, 2).toUpperCase();
}

interface Props {
  name: string;
  hasPhoto: boolean;
  /** An employee id (HR view) or 'me' (own profile). */
  scope: string;
  size?: 'md' | 'lg';
}

/** The photo is only available through HR with the caller's token, so it is fetched as a blob. */
export default function EmployeeAvatar({ name, hasPhoto, scope, size = 'md' }: Props) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const photo = useQuery({
    queryKey: hrKeys.photo(scope),
    queryFn: () => (scope === 'me' ? fetchMyPhoto(accessToken!) : fetchEmployeePhoto(accessToken!, scope)),
    enabled: Boolean(accessToken) && hasPhoto,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo.data) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(photo.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.data]);

  return (
    <span className={`hr-avatar hr-avatar--${size}`} role="img" aria-label={`Photo of ${name}`}>
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initialsOf(name)}</span>}
    </span>
  );
}
