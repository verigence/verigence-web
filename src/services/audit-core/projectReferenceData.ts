import { auditCoreRequest } from './client';

export interface ProjectSegmentReference {
  segmentId: string;
  segmentCode: string;
  segmentName: string;
}

export interface ProjectOemReference {
  oemId: string;
  oemCode: string;
  oemName: string;
}

export interface ProjectReferenceData {
  oems: ProjectOemReference[];
  segments: ProjectSegmentReference[];
}

export function getProjectReferenceData(accessToken: string) {
  return auditCoreRequest<ProjectReferenceData>('/v1/project-reference-data', {
    accessToken,
  });
}
