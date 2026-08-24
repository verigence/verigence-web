import { auditCoreRequest } from './client';

export interface ProjectOemSegmentReference {
  segmentId: string;
  segmentCode: string;
  segmentName: string;
}

export interface ProjectOemReference {
  oemId: string;
  oemCode: string;
  oemName: string;
  segments: ProjectOemSegmentReference[];
}

export interface ProjectReferenceData {
  oems: ProjectOemReference[];
}

export function getProjectReferenceData(accessToken: string) {
  return auditCoreRequest<ProjectReferenceData>('/v1/project-reference-data', {
    accessToken,
  });
}
