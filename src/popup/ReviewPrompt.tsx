import { useEffect, useState } from 'react';
import { REVIEW_PROMPT_THRESHOLD, STORE_REVIEW_URL } from '@/shared/constants';
import { t } from './helpers';

/**
 * Shown once a user has completed enough downloads to have found the
 * extension useful. Dismissible; never shown again after rate/dismiss.
 * Suppressed until the store id is filled in (placeholder review URL).
 */
export function ReviewPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    void chrome.storage.local
      .get(['dlCount', 'reviewPromptState'])
      .then(({ dlCount = 0, reviewPromptState }) => {
        const published = !STORE_REVIEW_URL.includes('REPLACE_WITH_STORE_ID');
        if (published && !reviewPromptState && dlCount >= REVIEW_PROMPT_THRESHOLD) {
          setVisible(true);
        }
      });
  }, []);

  if (!visible) return null;

  const close = (state: 'dismissed' | 'done') => {
    void chrome.storage.local.set({ reviewPromptState: state });
    setVisible(false);
  };

  return (
    <div className="m-3 rounded-xl border border-[#b5ff00]/40 bg-[#131915] p-3">
      <p className="text-xs font-bold text-[#b5ff00]">{t('reviewPromptTitle')}</p>
      <p className="mt-1 text-[11px] leading-snug text-[#d3dacf]">{t('reviewPromptBody')}</p>
      <div className="mt-2 flex gap-2">
        <a
          href={STORE_REVIEW_URL}
          target="_blank"
          rel="noopener"
          onClick={() => close('done')}
          className="rounded-lg bg-[#b5ff00] px-3 py-1.5 text-xs font-bold text-[#0b100d] no-underline hover:brightness-110"
        >
          {t('reviewPromptRate')}
        </a>
        <button
          onClick={() => close('dismissed')}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-[#a4aea6] hover:text-[#f3f5ea]"
        >
          {t('reviewPromptDismiss')}
        </button>
      </div>
    </div>
  );
}
