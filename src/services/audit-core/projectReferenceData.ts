import { auditCoreRequest } from './client';

interface ProjectSegmentReference {
  segmentId: string;
  segmentCode: string;
  segmentName: string;
}

interface ProjectOemReference {
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
