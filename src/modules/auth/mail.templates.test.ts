import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, exportEmail, otpEmail, type Language } from './mail.templates.js';
import type { OtpPurpose } from './otp.model.js';

const LANGUAGES: Language[] = ['en', 'fr', 'sw', 'rn'];
const PURPOSES: OtpPurpose[] = ['SIGNUP', 'LOGIN', 'RESET'];
const LINKS = { publicUrl: 'https://afya.example.com/', support: 'support@example.com' };

test('every code email carries the code in the subject, HTML and text', () => {
  for (const language of LANGUAGES) {
    for (const purpose of PURPOSES) {
      const mail = otpEmail({ code: '482915', purpose, language, minutes: 10, links: LINKS });
      assert.ok(mail.subject.startsWith('482915 '), `${language} ${purpose} subject`);
      assert.ok(mail.html.includes('482915'), `${language} ${purpose} html`);
      assert.ok(mail.text.includes('482915'), `${language} ${purpose} text`);
      assert.ok(mail.html.includes(`lang="${language}"`));
      for (const body of [mail.html, mail.text]) {
        assert.ok(!/undefined|NaN|\[object/.test(body), `${language} ${purpose} has a gap`);
      }
    }
  }
});

test('the expiry uses the configured minutes', () => {
  const mail = otpEmail({ code: '1', purpose: 'LOGIN', language: 'en', minutes: 7, links: {} });
  assert.ok(mail.text.includes('7 minutes'));
});

test('links and the logo come from the public URL, without a double slash', () => {
  const mail = otpEmail({
    code: '1',
    purpose: 'SIGNUP',
    language: 'en',
    minutes: 10,
    links: LINKS,
  });
  assert.ok(mail.html.includes('src="https://afya.example.com/email/logo.png"'));
  assert.ok(mail.html.includes('href="https://afya.example.com/privacy"'));
  assert.ok(mail.html.includes('href="mailto:support@example.com"'));
  assert.ok(mail.text.includes('support@example.com'));
});

test('without a public URL there is no logo or link, and a bad URL is ignored', () => {
  for (const publicUrl of [undefined, '', 'javascript:alert(1)', 'https://x.com/"onload="x']) {
    const mail = otpEmail({
      code: '1',
      purpose: 'SIGNUP',
      language: 'en',
      minutes: 10,
      links: { publicUrl },
    });
    assert.ok(!mail.html.includes('<img'), String(publicUrl));
    assert.ok(!mail.html.includes('/privacy'), String(publicUrl));
  }
});

test('sign-in and reset emails warn about someone else; signup says it can be ignored', () => {
  const login = otpEmail({ code: '1', purpose: 'LOGIN', language: 'en', minutes: 10, links: {} });
  const signup = otpEmail({ code: '1', purpose: 'SIGNUP', language: 'en', minutes: 10, links: {} });
  assert.ok(login.text.includes('change your password'));
  assert.ok(signup.text.includes('ignore this email'));
});

test('the support address is escaped', () => {
  const mail = exportEmail({ language: 'en', links: { support: 'a"<b>@x.com' } });
  assert.ok(!mail.html.includes('a"<b>'));
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('the export email exists in every language', () => {
  for (const language of LANGUAGES) {
    const mail = exportEmail({ language, links: LINKS });
    assert.ok(mail.subject.length > 0 && mail.text.length > 0);
    assert.ok(!/undefined/.test(mail.html));
  }
});
