import { AuditCoreHttpError, client } from './client';

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
    const response = await client.get<VehiclePhotoListResponse>(
      `/v2/tenants/${tenantId}/journeys/${journeyId}/delivery/vehicle-photos`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return response.data.photos;
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
    const response = await client.post<VehiclePhotoListResponse>(
      `/v2/tenants/${tenantId}/journeys/${journeyId}/delivery/vehicle-photos`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      },
    );
    return response.data.photos;
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
    await client.delete(
      `/v2/tenants/${tenantId}/journeys/${journeyId}/delivery/vehicle-photos/${photoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (error) {
    if (error instanceof AuditCoreHttpError) throw error;
    throw new Error(`Failed to delete vehicle photo: ${error}`);
  }
}
