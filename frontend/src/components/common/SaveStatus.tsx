/**
 * Small "Saving…/✓ Saved" inline indicator for autosaving forms - replaces the explicit "Save"
 * buttons this app previously required (Permissions matrix, Project details, and GitHub import
 * settings all switched to autosave together).
 */
interface Props {
  saving: boolean;
  saved: boolean;
}

export default function SaveStatus({ saving, saved }: Props) {
  if (!saving && !saved) return null;
  return (
    <div className="h-5 flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
      {saving ? (
        <>
          <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          Saving…
        </>
      ) : (
        <span style={{ color: '#10b981' }}>✓ Saved</span>
      )}
    </div>
  );
}
