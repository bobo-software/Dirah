import { describe, expect, it } from 'vitest';
import { markdownListItems } from './markdownList';

describe('markdownListItems', () => {
  it('reads bullets, numbers and task items in order, keeping checks', () => {
    const markdown = [
      '# Packing',
      '',
      'Some intro text.',
      '- Passport',
      '* Charger',
      '+ Socks',
      '1. Tickets',
      '2) Snacks',
      '- [ ] Sunscreen',
      '- [x] Toothbrush',
      '- [X] Hat',
      '  - nested item',
    ].join('\n');
    expect(markdownListItems(markdown)).toEqual([
      { text: 'Passport', checked: false },
      { text: 'Charger', checked: false },
      { text: 'Socks', checked: false },
      { text: 'Tickets', checked: false },
      { text: 'Snacks', checked: false },
      { text: 'Sunscreen', checked: false },
      { text: 'Toothbrush', checked: true },
      { text: 'Hat', checked: true },
      { text: 'nested item', checked: false },
    ]);
  });

  it('strips inline markdown and skips empty items and code blocks', () => {
    const markdown = [
      '- **Bold** and _italic_ with `code`',
      '- [Docs](https://example.com) link',
      '- ~~old~~ new',
      '- ',
      '- [ ] ',
      '```',
      '- not a list item',
      '```',
      'Paragraph - with a dash',
    ].join('\n');
    expect(markdownListItems(markdown)).toEqual([
      { text: 'Bold and italic with code', checked: false },
      { text: 'Docs link', checked: false },
      { text: 'old new', checked: false },
    ]);
  });

  it('returns nothing for a note without lists', () => {
    expect(markdownListItems('# Title\n\nJust prose.\n\n---\n')).toEqual([]);
  });
});
