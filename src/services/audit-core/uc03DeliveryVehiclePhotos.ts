import { AuditCoreHttpError, auditCoreRequest } from './client';

export interface VehiclePhoto {
  photoId: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  uploadedByActorId: string;
  uploadedAtUtc: string;
  contentUrl: string;
}

export interface VehiclePhotoListResponse {
  photos: VehiclePhoto[];
}

export async function listVehiclePhotos(
  tenantId: string,
  journeyId: string,
  accessToken: string,
): Promise<VehiclePhoto[]> {
  try {
    const response = await auditCoreRequest<VehiclePhotoListResponse>(
      `/v2/tenants/${tenantId}/journeys/${journeyId}/delivery/vehicle-photos`,
      { accessToken, method: 'GET' },
    );
    return response.photos;
  } catch (error) {
    if (error instanceof AuditCoreHttpError) throw error;
    throw new Error(`Failed to list vehicle photos: ${error}`);
  }
}

export async function uploadVehiclePhotos(
  tenantId: string,
  journeyId: string,
  files: File[],
  accessToken: string,
): Promise<VehiclePhoto[]> {
  try {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    const response = await auditCoreRequest<VehiclePhotoListResponse>(
      `/v2/tenants/${tenantId}/journeys/${journeyId}/delivery/vehicle-photos`,
      { accessToken, method: 'POST', body: formData },
    );
    return response.photos;
  } catch (error) {
    if (error instanceof AuditCoreHttpError) throw error;
    throw new Error(`Failed to upload vehicle photos: ${error}`);
  }
}

export async function deleteVehiclePhoto(
  tenantId: string,
  journeyId: string,
  photoId: string,
  accessToken: string,
): Promise<void> {
  try {
    await auditCoreRequest<void>(
      `/v2/tenants/${tenantId}/journeys/${journeyId}/delivery/vehicle-photos/${photoId}`,
      { accessToken, method: 'DELETE' },
    );
  } catch (error) {
    if (error instanceof AuditCoreHttpError) throw error;
    throw new Error(`Failed to delete vehicle photo: ${error}`);
  }
}
