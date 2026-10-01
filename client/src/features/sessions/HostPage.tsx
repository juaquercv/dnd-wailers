import { AppShell } from '../../components/layout/AppShell';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the lobby agent. Route: /hostear. */
export default function HostPage() {
  return (
    <AppShell title="Hostear partida" subtitle="Dirige la mesa como DM" back="/menu">
      <div className="mx-auto max-w-3xl p-6">
        <UnderConstruction title="Hostear partida" />
      </div>
    </AppShell>
  );
}
