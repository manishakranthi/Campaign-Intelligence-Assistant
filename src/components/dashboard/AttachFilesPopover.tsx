"use client";

import { PLATFORM_KEYS, PLATFORM_TAB_LABEL, PlatformKey } from "@/lib/platforms";

export function AttachFilesPopover({
  files,
  onChange,
  onClose,
}: {
  files: Partial<Record<PlatformKey, File>>;
  onChange: (next: Partial<Record<PlatformKey, File>>) => void;
  onClose: () => void;
}) {
  function setFile(platform: PlatformKey, file: File | null) {
    const next = { ...files };
    if (file) next[platform] = file;
    else delete next[platform];
    onChange(next);
  }

  return (
    <div
      className="absolute bottom-full left-0 z-40 mb-2 w-full max-w-sm rounded-2xl border border-surface-border bg-surface p-4 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Attach campaign files
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        Attach a raw export for any platform this campaign runs on. Attaching 2+ unlocks
        cross-platform comparison.
      </p>
      <div className="flex flex-col gap-2">
        {PLATFORM_KEYS.map((platform) => (
          <div key={platform} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {PLATFORM_TAB_LABEL[platform]}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setFile(platform, e.target.files?.[0] ?? null)}
              className="flex-1 text-xs text-zinc-500 file:mr-2 file:rounded-full file:border-0 file:bg-zinc-100 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:hover:file:bg-zinc-700"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground shadow-sm shadow-accent/30 transition-all hover:-translate-y-px hover:shadow-md hover:shadow-accent/30"
        >
          Done
        </button>
      </div>
    </div>
  );
}
