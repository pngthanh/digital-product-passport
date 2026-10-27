import {
  PRODUCT_STATE_TRANSITIONS,
  SERVICE_STATE_TRANSITIONS,
  TRANSFER_STATE_TRANSITIONS,
  type TransitionTable,
  WARRANTY_STATE_TRANSITIONS,
} from '@dpp/shared';
import {
  PRODUCT_STATE_LABELS,
  SERVICE_STATE_LABELS,
  type StateLabel,
  TRANSFER_STATE_LABELS,
  WARRANTY_STATE_LABELS,
} from '@/lib/state-labels';

export interface LifecycleMachine<S extends string = string> {
  title: string;
  description: string;
  /** Đường đi thường gặp, mỗi bước phải là chuyển trạng thái hợp lệ trong `transitions`. */
  mainPath: readonly S[];
  /** Các trạng thái kết thúc khác ngoài đường chính. */
  otherEndings: readonly S[];
  transitions: TransitionTable<S>;
  labels: Record<S, StateLabel>;
}

/** Kiểm tra kiểu theo từng state machine, sau đó gom chung một danh sách. */
function defineMachine<S extends string>(machine: LifecycleMachine<S>): LifecycleMachine {
  return machine;
}

export const LIFECYCLE_MACHINES: readonly LifecycleMachine[] = [
  defineMachine({
    title: 'Sản phẩm',
    description: 'Vị trí trong chuỗi phân phối. Không chứa thông tin ai là chủ sở hữu.',
    mainPath: ['CREATED', 'IN_DISTRIBUTION', 'AT_RETAIL', 'SOLD'],
    otherEndings: ['RECALLED', 'LOST_STOLEN', 'RETIRED'],
    transitions: PRODUCT_STATE_TRANSITIONS,
    labels: PRODUCT_STATE_LABELS,
  }),
  defineMachine({
    title: 'Bảo hành',
    description: 'Kích hoạt khi bán lần đầu, tạm dừng trong lúc sửa, hết hạn theo thời gian.',
    mainPath: ['ACTIVE', 'SUSPENDED'],
    otherEndings: ['EXPIRED'],
    transitions: WARRANTY_STATE_TRANSITIONS,
    labels: WARRANTY_STATE_LABELS,
  }),
  defineMachine({
    title: 'Phiếu dịch vụ',
    description: 'Mỗi lần mang máy đi sửa là một phiếu riêng, đóng lại khi có kết quả.',
    mainPath: ['REQUESTED', 'IN_REPAIR', 'REPAIRED'],
    otherEndings: ['REJECTED', 'CANCELLED'],
    transitions: SERVICE_STATE_TRANSITIONS,
    labels: SERVICE_STATE_LABELS,
  }),
  defineMachine({
    title: 'Yêu cầu chuyển quyền',
    description: 'Mỗi sản phẩm chỉ có tối đa một yêu cầu đang chờ bên nhận.',
    mainPath: ['REQUESTED', 'COMPLETED'],
    otherEndings: ['REJECTED', 'CANCELLED', 'EXPIRED'],
    transitions: TRANSFER_STATE_TRANSITIONS,
    labels: TRANSFER_STATE_LABELS,
  }),
];
