/**
 * Shared error sheet for the study tools - one copy voice ("Got it"), one
 * single-action layout, over the app's ConfirmDialog primitive.
 */
import ConfirmDialog from "@shared/components/ConfirmDialog";

export interface StudyErrorState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface StudyErrorDialogProps {
  error: StudyErrorState;
  onClose: () => void;
}

const StudyErrorDialog = ({ error, onClose }: StudyErrorDialogProps) => (
  <ConfirmDialog
    isOpen={error.isOpen}
    onClose={onClose}
    onConfirm={onClose}
    title={error.title}
    message={error.message}
    confirmText="Got it"
    cancelText=""
    danger={false}
  />
);

export default StudyErrorDialog;
