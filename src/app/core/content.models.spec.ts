import { Node, buildTranslation, cleanForSave, cloneWithNewIds, findProblems, indexTranslation, newBlock, slugProblem } from './content.models';

describe('Page builder content', () => {
  const english: Node[] = [
    { id: 'h1', type: 'hero', title: 'Our team', lead: 'People', image: 'img/selfie-1.svg' },
    { id: 'c1', type: 'cards', layout: 'grid', items: [{ id: 'c1a', title: 'Volunteers', text: 'Hi', url: '/about' }] }
  ];

  it('new blocks get an id, default choices and one empty entry per list', () => {
    const b = newBlock('cards');
    expect(b.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    expect(b['layout']).toBe('grid');
    expect((b['items'] as Node[]).length).toBe(1);
  });

  it('copies get new ids everywhere', () => {
    const copy = cloneWithNewIds(english[1]);
    expect(copy.id).not.toBe('c1');
    expect((copy['items'] as Node[])[0].id).not.toBe('c1a');
    expect((copy['items'] as Node[])[0]['title']).toBe('Volunteers');
  });

  it('saving drops empty fields and turns digit values into numbers', () => {
    const [b] = cleanForSave([{ id: 's', type: 'stats', note: '', items: [{ id: 'n', value: ' 25000 ', label: 'Selfies', suffix: '' }] }]);
    expect(b).toEqual({ id: 's', type: 'stats', items: [{ id: 'n', value: 25000, label: 'Selfies' }] } as unknown as Node);
  });

  it('finds what the API would refuse', () => {
    const problems = findProblems([{ id: 'x', type: 'cta', text: '<b>', buttons: [{ id: 'y', url: 'javascript:alert(1)', icon: 'fa fa-x' }] }]);
    expect(problems.length).toBe(3);
    expect(findProblems(english)).toEqual([]);
  });

  it('a translation keeps only text, nested like the English page', () => {
    const tr = { h1: { title: 'Notre équipe', lead: ' ' }, c1a: { title: 'Bénévoles' }, gone: { title: 'x' } };
    expect(buildTranslation(english, tr)).toEqual([
      { id: 'h1', title: 'Notre équipe' }, { id: 'c1', items: [{ id: 'c1a', title: 'Bénévoles' }] }
    ] as Node[]);
    expect(indexTranslation(buildTranslation(english, tr))).toEqual({ h1: { title: 'Notre équipe' }, c1: {}, c1a: { title: 'Bénévoles' } });
  });

  it('checks web addresses like the API', () => {
    expect(slugProblem('our-team')).toBeNull();
    expect(slugProblem('Our Team')).toContain('lower-case');
    expect(slugProblem('login')).toContain('already used');
  });
});
