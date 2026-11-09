import { describe, expect, it } from 'vitest';
import { releaseNoteBlocks } from '../AppDownloadPage';

describe('release notes on the download page', () => {
  it('turns headings, paragraphs and bullets into blocks, as text', () => {
    const blocks = releaseNoteBlocks('## For everyone\n- **New address**: open it\n- Second\n\nPlain line <b>x</b>');
    expect(blocks).toEqual([
      { kind: 'heading', text: 'For everyone' },
      { kind: 'list', items: ['New address: open it', 'Second'] },
      { kind: 'text', text: 'Plain line <b>x</b>' },
    ]);
  });

  it('has nothing to show without notes', () => {
    expect(releaseNoteBlocks(null)).toEqual([]);
    expect(releaseNoteBlocks('  \n ')).toEqual([]);
  });
});
