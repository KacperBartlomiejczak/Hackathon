import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DATABASE_URL = 'postgres://dummy';
const { extractPostLinks, readFacebook, pageHtml, isPostUrl, pageHandle } = await import('./facebook.js');

const page = { title: '', ogTitle: '', ogDescription: '', bodyText: '' };

test('extractPostLinks: canonical, deduped, ignores non-post links, caps', () => {
  const hrefs = [
    'https://www.facebook.com/Bankierpl/posts/pfbid0abc?__cft__[0]=x',
    'https://www.facebook.com/Bankierpl/posts/pfbid0abc',
    'https://m.facebook.com/Bankierpl/posts/pfbid0def',
    'https://www.facebook.com/Bankierpl/photos/1',
  ];
  assert.deepEqual(extractPostLinks(hrefs), [
    'https://www.facebook.com/Bankierpl/posts/pfbid0abc',
    'https://www.facebook.com/Bankierpl/posts/pfbid0def',
  ]);
  assert.equal(extractPostLinks(hrefs, 1).length, 1);
});

test('readFacebook: unavailable page throws a readable error', () => {
  const walled = { ...page, title: 'Facebook', bodyText: 'Te materiały nie są teraz dostępne.' };
  assert.throws(() => readFacebook(walled, 'https://www.facebook.com/xtbpolska'), /not available without login/);
});

test('readFacebook: page uses og:title and og:description', () => {
  const p = { ...page, title: 'Bankier.pl | Facebook', ogTitle: 'Bankier.pl', ogDescription: 'Serwis o finansach' };
  assert.deepEqual(readFacebook(p, 'https://www.facebook.com/Bankierpl'), { title: 'Bankier.pl', text: 'Serwis o finansach' });
  assert.throws(() => readFacebook({ ...p, ogTitle: '' }, 'https://www.facebook.com/Bankierpl'), /no public description/);
});

test('readFacebook: post keeps visible text and drops login-wall lines', () => {
  const p = {
    ...page,
    title: 'Jan - post | Facebook',
    ogTitle: 'Jan',
    bodyText: 'Zaloguj się\nNie pamiętasz nazwy konta?\nZarabiaj 30% miesięcznie\nbez ryzyka',
  };
  assert.equal(readFacebook(p, 'https://www.facebook.com/jan/posts/pfbid1').text, 'Zarabiaj 30% miesięcznie\nbez ryzyka');
  const onlyWall = { ...p, bodyText: 'Zaloguj się' };
  assert.throws(() => readFacebook(onlyWall, 'https://www.facebook.com/jan/posts/pfbid1'), /post text not visible/);
});

test('pageHtml escapes, isPostUrl and pageHandle', () => {
  assert.match(pageHtml({ title: '<b>', text: 'a & b' }, 'x'), /&lt;b&gt;[\s\S]*a &amp; b/);
  assert.equal(isPostUrl('https://www.facebook.com/a/posts/pfbid1'), true);
  assert.equal(isPostUrl('https://www.facebook.com/a'), false);
  assert.equal(pageHandle('https://www.facebook.com/Bankierpl/posts/x'), 'Bankierpl');
});
