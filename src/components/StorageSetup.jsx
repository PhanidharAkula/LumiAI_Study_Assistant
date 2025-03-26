import { useEffect } from "react";

const StorageSetup = ({ onComplete }) => {
  // Auto-complete immediately
  useEffect(() => {
    // Immediately notify parent that we're ready
    onComplete && onComplete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return null to render nothing
  return null;
};

export default StorageSetup;
