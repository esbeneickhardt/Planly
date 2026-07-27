/**
 * Small "Owner"/"Co-owner" project-role badge - previously defined verbatim in both
 * SettingsPermissions.tsx and SettingsTeam.tsx; now a single shared source.
 */
export default function RoleBadge({ kind }: { kind: 'owner' | 'co_owner' }) {
  if (kind === 'owner')
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
        style={{ background: 'var(--brand-subtle)', color: 'var(--brand)' }}
      >
        Owner
      </span>
    );
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
      style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}
    >
      Co-owner
    </span>
  );
}
