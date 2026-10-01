import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Backpack, BedDouble, Coins, Dumbbell, RotateCcw, Scale, ScrollText, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';
import { createRuleSystem, type RuleSystem } from '@wailers/shared';
import { Button } from '../../components/ui/Button';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/toast';
import { MagicModeBadge } from '../campaigns/magicModes';
import { AttributesSection } from './extras/rules/AttributesSection';
import { HeroCreationSection } from './extras/rules/HeroCreationSection';
import { CurrencySection, InventorySection } from './extras/rules/InventorySection';
import { MagicSection } from './extras/rules/MagicSection';
import { PermissionsSection } from './extras/rules/PermissionsSection';
import { RestsSection } from './extras/rules/RestsSection';
import { useRulesUpdater } from './extras/rules/ruleUtils';
import { SheetSection } from './extras/rules/SheetSection';

export interface RulesEditorProps {
  rules: RuleSystem;
  onChange: (rules: RuleSystem) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { id: 'reglas-magia', label: 'Magia', icon: <Sparkles /> },
  { id: 'reglas-atributos', label: 'Atributos', icon: <Dumbbell /> },
  { id: 'reglas-hoja', label: 'Hoja de personaje', icon: <ScrollText /> },
  { id: 'reglas-inventario', label: 'Inventario', icon: <Backpack /> },
  { id: 'reglas-moneda', label: 'Moneda', icon: <Coins /> },
  { id: 'reglas-descansos', label: 'Descansos', icon: <BedDouble /> },
  { id: 'reglas-creacion', label: 'Creación de héroes', icon: <UserPlus /> },
  { id: 'reglas-permisos', label: 'Permisos', icon: <ShieldCheck /> },
];

/**
 * Full campaign rule system form. Rules only drive what is shown and which manual buttons exist:
 * nothing is ever applied automatically. Every change is emitted with onChange(rules).
 */
export function RulesEditor({ rules, onChange }: RulesEditorProps) {
  const update = useRulesUpdater(rules, onChange);
  const confirm = useConfirm();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(NAV[0]!.id);

  // Highlight the section currently in view.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = NAV.find((n) => visible.has(n.id));
        if (first) setActive(first.id);
      },
      { root, rootMargin: '0px 0px -55% 0px', threshold: 0 },
    );
    for (const item of NAV) {
      const el = root.querySelector(`#${item.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const goTo = (id: string) => {
    const root = scrollRef.current;
    const el = root?.querySelector<HTMLElement>(`#${id}`);
    if (!root || !el) return;
    setActive(id);
    root.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Restablecer reglas',
      message:
        'Se volverán a los valores por defecto todos los apartados (atributos, inventario, moneda, descansos, creación de héroes y permisos). Se conserva el sistema de magia elegido.',
      confirmLabel: 'Restablecer',
      danger: true,
    });
    if (!ok) return;
    onChange(createRuleSystem(rules.magic.mode));
    toast.success('Reglas restablecidas');
  };

  return (
    <div ref={scrollRef} className="scroll-thin relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 pb-16 pt-6 sm:px-6">
        <nav className="sticky top-6 hidden w-52 shrink-0 self-start lg:block" aria-label="Apartados de las reglas">
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => goTo(item.id)}
                  aria-current={active === item.id ? 'true' : undefined}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition [&_svg]:h-4 [&_svg]:w-4',
                    active === item.id
                      ? 'bg-gold-500/10 text-gold-200 shadow-[inset_2px_0_0_#e9c063]'
                      : 'text-parchment-300 hover:bg-ink-800 hover:text-parchment-100',
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="divider" />
          <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void resetAll()} className="w-full justify-start">
            Restablecer reglas
          </Button>
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="title-epic text-2xl">Reglas de la campaña</h2>
              <p className="mt-1 max-w-2xl text-sm text-parchment-300">
                Ajusta el sistema a tu mesa. Las reglas solo deciden qué se muestra y qué botones tiene el DM: ninguna tirada cambia nada
                por sí sola.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-parchment-400">
                <Scale className="h-3.5 w-3.5" />
                Magia:
              </span>
              <MagicModeBadge mode={rules.magic.mode} manaName={rules.magic.manaName} />
              <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void resetAll()} className="lg:hidden">
                Restablecer
              </Button>
            </div>
          </header>

          <MagicSection id="reglas-magia" rules={rules} update={update} />
          <AttributesSection id="reglas-atributos" rules={rules} update={update} />
          <SheetSection id="reglas-hoja" rules={rules} update={update} />
          <InventorySection id="reglas-inventario" rules={rules} update={update} />
          <CurrencySection id="reglas-moneda" rules={rules} update={update} />
          <RestsSection id="reglas-descansos" rules={rules} update={update} />
          <HeroCreationSection id="reglas-creacion" rules={rules} update={update} />
          <PermissionsSection id="reglas-permisos" rules={rules} update={update} />
        </div>
      </div>
    </div>
  );
}
