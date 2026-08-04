/**
 * Request Identity - attached to every authenticated request.
 */

export type ActorType = 'user' | 'service_account' | 'system' | 'anonymous';

export interface ProjectRoleInfo {
  roleCode: string;
  permissions: string[];
}

export interface RequestIdentity {
  actorType: ActorType;
  actorId: string;
  serviceAccountCode?: string;
  displayName: string;
  globalRoles: string[];
  globalPermissions: string[];
  projectRoles: Record<string, ProjectRoleInfo[]>;
}

export const ANONYMOUS_IDENTITY: RequestIdentity = {
  actorType: 'anonymous',
  actorId: 'anonymous',
  displayName: 'Anonymous',
  globalRoles: [],
  globalPermissions: [],
  projectRoles: {},
};
