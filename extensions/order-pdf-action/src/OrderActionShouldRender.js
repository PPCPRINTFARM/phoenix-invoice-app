import { extension } from '@shopify/ui-extensions/admin';

const TARGET = 'admin.order-details.action.should-render';

export default extension(TARGET, async (api) => {
  const selected = api.data?.selected || [];
  const id = selected[0]?.id;
  return { display: Boolean(id) };
});
