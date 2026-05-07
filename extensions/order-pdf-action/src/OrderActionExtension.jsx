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

const TARGET = 'admin.order-details.action.render';
const BACKEND_BASE = 'https://phoenix-invoice-app.onrender.com';

export default reactExtension(TARGET, () => <App />);

function extractLegacyId(gid) {
  if (!gid) return null;
  const match = String(gid).match(/(\d+)(?!.*\d)/);
  return match ? match[1] : null;
}

function App() {
  const { i18n, close, data } = useApi(TARGET);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const gid = data?.selected?.[0]?.id || null;
  const legacyId = extractLegacyId(gid);

  const handleDownload = useCallback(() => {
    if (!legacyId && !gid) {
      setError('Could not determine the order ID from this page.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const idPart = legacyId
        ? legacyId
        : encodeURIComponent(gid);
      const url = `${BACKEND_BASE}/api/pdf/order/${idPart}`;
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
          Download the branded Phoenix Phase Converters invoice PDF for this order.
        </Text>
        {legacyId && (
          <Text appearance="subdued">Order ID: {legacyId}</Text>
        )}
        {error && <Banner tone="critical">{error}</Banner>}
      </BlockStack>
    </AdminAction>
  );
}
