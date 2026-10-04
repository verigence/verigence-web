import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchMyPhoto, getMyEmployee, uploadMyPhoto, type EmployeeDetail } from '../../services/hr/employees';
import { useSessionStore } from '../../store/sessionStore';
import { hrKeys, useHrAccess } from './hrQueries';

/**
 * The signed-in person's own HR record, only when HR says one is linked (so a person without one
 * costs no request). A failure simply leaves the data out; callers fall back to the sign-in name.
 */
export function useMyHrIdentity() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const access = useHrAccess();
  const enabled = Boolean(accessToken) && access.isEmployee;
  const employee = useQuery({
    queryKey: hrKeys.myEmployee,
    queryFn: () => getMyEmployee(accessToken!),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const hasPhoto = Boolean(employee.data?.hasPhoto);
  const photo = useQuery({
    queryKey: hrKeys.photo('me'),
    queryFn: () => fetchMyPhoto(accessToken!),
    enabled: enabled && hasPhoto,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo.data) {
      setPhotoUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo.data);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.data]);

  return {
    /** True when the HR service says an employee record is linked to this login. */
    hasRecord: access.isEmployee,
    fullName: employee.data?.fullName ?? null,
    designation: employee.data?.designation ?? null,
    hasPhoto,
    photoUrl,
  };
}

/** Uploads the person's own photo and refreshes what shows it. Errors reach the caller (the picker shows them). */
export function useUploadMyPhoto() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (p: { blob: Blob; name: string }) => uploadMyPhoto(accessToken!, p.blob, p.name),
    onSuccess: async (data) => {
      queryClient.setQueryData<EmployeeDetail>(hrKeys.myEmployee, (old) => (old ? { ...old, ...data } : old));
      await queryClient.invalidateQueries({ queryKey: hrKeys.photo('me') });
    },
  });
}
