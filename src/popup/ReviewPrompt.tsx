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
    <div className="m-3 rounded-xl border border-[#bfff00]/40 bg-gradient-to-br from-[#bfff00]/10 to-[#00e5ff]/10 p-3">
      <p className="text-xs font-bold text-[#bfff00]">{t('reviewPromptTitle')}</p>
      <p className="mt-1 text-[11px] leading-snug text-[#c5ccd6]">{t('reviewPromptBody')}</p>
      <div className="mt-2 flex gap-2">
        <a
          href={STORE_REVIEW_URL}
          target="_blank"
          rel="noopener"
          onClick={() => close('done')}
          className="rounded-lg bg-[#bfff00] px-3 py-1.5 text-xs font-bold text-[#0b0d11] no-underline hover:brightness-110"
        >
          {t('reviewPromptRate')}
        </a>
        <button
          onClick={() => close('dismissed')}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-[#8a93a3] hover:text-[#f4f7fb]"
        >
          {t('reviewPromptDismiss')}
        </button>
      </div>
    </div>
  );
}
