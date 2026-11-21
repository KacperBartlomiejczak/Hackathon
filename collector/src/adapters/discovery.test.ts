import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLinks } from './discovery.js';

const html = `
<a href="/blog/jak-zaczac-inwestowac">Start</a>
<a href="https://www.blog.example/forex-dla-poczatkujacych#komentarze">Forex</a>
<a href="https://blog.example/forex-dla-poczatkujacych">duplikat</a>
<a href='/o-mnie'>Sygnały <b>giełdowe</b></a>
<a href="/kontakt">Kontakt</a>
<a href="https://inny.example/forex">obcy host</a>
<a href="/raport-cfd.pdf">CFD pdf</a>
<a href="/%E0%A4%A">giełda zły escape</a>
<a href="mailto:x@blog.example">broker mail</a>
<a href="http://[bad">broker</a>
`;

test('same-host keyword links, deduped, no files or foreign hosts', () => {
  assert.deepEqual(extractLinks(html, 'https://blog.example/'), [
    'https://blog.example/blog/jak-zaczac-inwestowac',
    'https://www.blog.example/forex-dla-poczatkujacych',
    'https://blog.example/o-mnie',
    'https://blog.example/%E0%A4%A',
  ]);
});

test('respects max', () => {
  assert.equal(extractLinks(html, 'https://blog.example/', undefined, 2).length, 2);
});
