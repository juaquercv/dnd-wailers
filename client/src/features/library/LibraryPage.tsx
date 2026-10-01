import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { UnderConstruction } from '../../components/ui/UnderConstruction';

/** Placeholder — replaced by the library-client agent. Route: /biblioteca and /biblioteca/:kind. */
export default function LibraryPage() {
  const { kind } = useParams<{ kind?: string }>();
  return (
    <AppShell title="Biblioteca compartida" back="/menu">
      <div className="mx-auto max-w-3xl p-6">
        <UnderConstruction title="Biblioteca compartida" detail={kind ? `Tipo: ${kind}` : undefined} />
      </div>
    </AppShell>
  );
}
