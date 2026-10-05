/**
 * Line-edit compatibility wrappers. The durable marker and the other dirty
 * fields live in `local-dirty.ts`.
 */
export {
  clearPendingLineEdit,
  hasPendingLineEdit,
  markPendingLineEdit,
  resetPendingLineEditsForTests,
} from './local-dirty';
