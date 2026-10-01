import { AppShell } from '../../components/layout/AppShell';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the editor-extras agent. Route: /campanas. */
export default function CampaignListPage() {
  return (
    <AppShell title="Campañas" subtitle="Crea y edita tus campañas" back="/menu">
      <div className="mx-auto max-w-3xl p-6">
        <UnderConstruction title="Lista de campañas" />
      </div>
    </AppShell>
  );
}
