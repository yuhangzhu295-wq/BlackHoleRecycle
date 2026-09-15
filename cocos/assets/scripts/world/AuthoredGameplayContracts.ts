import { Node } from 'cc';

export { AuthoredResourceCluster } from './AuthoredResourceCluster';
export { AuthoredTrafficRoute } from './AuthoredTrafficRoute';

export type VehicleKind = 'sedan' | 'garbage_truck' | 'delivery_van';

export interface AuthoredRuntimeCluster {
  clusterId: string;
  anchorNode: Node | null;
  spawnGroup: Node | null;
  objects: Node[];
}
