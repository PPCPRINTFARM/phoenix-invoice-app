import {
  reactExtension,
  useApi,
  AdminAction,
  Button,
  BlockStack,
  Text,
  Banner,
} from '@shopify/ui-extensions-react/admin';
import { useState, useCallback } from 'react';

const TARGET = 'admin.draft-order-details.action.render';
const BACKEND_BASE = 'https://phoenix-invoice-app.onrender.com';

export default reactExtension(TARGET, () => <App />);

function extractLegacyId(gid) {
  if (!gid) return null;
  const match = String(gid).match(/(\d+)(?!.*\d)/);
  return match ? match[1] : null;
}

function App() {
  const { close, data } = useApi(TARGET);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const gid = data?.selected?.[0]?.id || null;
  const legacyId = extractLegacyId(gid);

  const handleDownload = useCallback(() => {
    if (!legacyId && !gid) {
      setError('Could not determine the draft order ID from this page.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const idPart = legacyId
        ? legacyId
        : encodeURIComponent(gid);
      const url = `${BACKEND_BASE}/api/pdf/draft/${idPart}`;
      open(url);
      setTimeout(() => close(), 250);
    } catch (e) {
      setError(e?.message || 'Failed to open PDF.');
      setBusy(false);
    }
  }, [legacyId, gid, close]);

  return (
    <AdminAction
      title="Phoenix Phase Converters"
      primaryAction={
        <Button onPress={handleDownload} disabled={busy || (!legacyId && !gid)}>
          Download PDF
        </Button>
      }
      secondaryAction={<Button onPress={close}>Cancel</Button>}
    >
      <BlockStack gap="base">
        <Text>
          Download the branded Phoenix Phase Converters quote PDF for this draft order.
        </Text>
        {legacyId && (
          <Text appearance="subdued">Draft Order ID: {legacyId}</Text>
        )}
        {error && <Banner tone="critical">{error}</Banner>}
      </BlockStack>
    </AdminAction>
  );
}
