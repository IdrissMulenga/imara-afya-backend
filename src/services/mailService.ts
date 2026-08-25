import { envConf } from './../config/envConf.js';


//EMAIL DELIVERY VIA RESEND.
//
//Called over plain fetch rather than through the `resend` SDK. The whole API we
//need is one POST, Node has fetch built in, and a dependency that exists to
//wrap a single HTTP call is a dependency to keep patched for no benefit.
//
//WHEN MAIL ISN'T CONFIGURED:
//  • development — the message is printed to the server console, so the reset
//                  flow can be tested end to end without a provider
//  • production  — sending fails loudly. A reset email the user never receives
//                  is worse than an honest error, because they will sit waiting
//                  for it instead of asking for help.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

//Resend is normally fast, but a hung request would hold a resolver open and
//tie up the instance. Give up and report rather than wait forever.
const SEND_TIMEOUT_MS = 10_000;


//SENDING BEFORE YOU OWN A DOMAIN.
//
//Resend gives every account a shared sender you can use immediately, with one
//significant catch: it will ONLY deliver to the email address the Resend
//account was registered with. Every other recipient is refused.
//
//That is fine for testing the flow end to end, and useless for real users — so
//it is allowed, but it announces itself rather than looking like it works.
//
//Setting MAIL_FROM to an address on a verified domain is the only change
//needed later. Nothing else in the codebase moves.
const RESEND_TEST_SENDER = 'Imara Afya <onboarding@resend.dev>';

const usingTestSender = () => !envConf.MAIL_FROM;

const senderAddress = () => envConf.MAIL_FROM || RESEND_TEST_SENDER;

//warn once per process, not once per email — a log line on every password
//reset would bury anything else worth reading
let warnedAboutTestSender = false;

const warnOnceAboutTestSender = () => {
    if (warnedAboutTestSender) return;

    warnedAboutTestSender = true;

    console.warn(
        '[mail] MAIL_FROM is not set, so sending via Resend\'s shared test address. '
        + 'Resend will ONLY deliver to the address your Resend account is registered with — '
        + 'every other recipient is rejected. Verify a domain and set MAIL_FROM before real users arrive.',
    );
};

type Mail = {
    to: string;
    subject: string;
    /** plain text — always sent, and what most mail clients fall back to */
    body: string;
    /** optional HTML version; improves both appearance and deliverability */
    html?: string;
};


//The API key alone is enough to send — MAIL_FROM is what upgrades us from
//"only reaches the account owner" to "reaches anyone".
export const isMailConfigured = () => Boolean(envConf.RESEND_API_KEY);

//Exposed so /health can report it: a deployment that can only email one person
//is something you want to see on a status page, not discover from a support
//message three weeks later.
export const mailStatus = () => {
    if (!envConf.RESEND_API_KEY) return 'not-configured';

    return envConf.MAIL_FROM ? 'ready' : 'test-sender-only';
};


export const sendMail = async ({ to, subject, body, html }: Mail) => {
    if (!isMailConfigured()) {
        if (envConf.IS_PRODUCTION) {
            //surfaced to the caller, which turns it into a generic user-facing error
            throw new Error('MAIL_NOT_CONFIGURED');
        }

        console.log('\n----- EMAIL (dev only, not actually sent) -----');
        console.log('to     :', to);
        console.log('subject:', subject);
        console.log(body);
        console.log('-----------------------------------------------\n');

        return;
    }

    if (usingTestSender()) warnOnceAboutTestSender();

    //AbortController rather than Promise.race, so a timeout actually cancels
    //the request instead of leaving it running in the background
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${envConf.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: senderAddress(),
                to: [to],
                subject,
                text: body,
                ...(html ? { html } : {}),
                ...(envConf.MAIL_REPLY_TO ? { reply_to: envConf.MAIL_REPLY_TO } : {}),
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            //Read the body for the log — Resend explains refusals clearly
            //("domain not verified", "invalid from address"), and without it
            //you are debugging a bare status code.
            const detail = await response.text().catch(() => '');

            //THE ERROR YOU WILL ACTUALLY HIT WHILE TESTING.
            //
            //On the shared sender, Resend refuses any recipient other than the
            //account owner. That comes back as a 403 with a message about
            //testing, and it is not a bug in this code — so say what it is
            //rather than leaving someone to decode it.
            if (usingTestSender() && (response.status === 403 || /testing|verify a domain/i.test(detail))) {
                console.error(
                    '[mail] Resend refused this recipient. On the shared test sender it will only '
                    + 'deliver to the address your Resend account is registered with. '
                    + 'Verify a domain and set MAIL_FROM to send to anyone else.',
                );

                throw new Error('MAIL_RECIPIENT_NOT_ALLOWED');
            }

            //Never logged with the recipient's address alongside the failure in
            //production logs we don't control — the message is enough.
            console.error('MAIL_SEND_FAILED:', response.status, detail.slice(0, 500));

            throw new Error('MAIL_SEND_FAILED');
        }
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            console.error('MAIL_SEND_TIMEOUT after', SEND_TIMEOUT_MS, 'ms');

            throw new Error('MAIL_SEND_FAILED');
        }

        //already ours, or a network failure — either way the caller handles it
        if (error?.message === 'MAIL_SEND_FAILED') throw error;
        if (error?.message === 'MAIL_RECIPIENT_NOT_ALLOWED') throw error;

        console.error('MAIL_SEND_ERROR:', error?.message);

        throw new Error('MAIL_SEND_FAILED');
    } finally {
        clearTimeout(timer);
    }
};


//escape anything that could break out of the HTML. The token is ours and is
//hex, but treating it as untrusted costs nothing and means this helper stays
//safe if it is ever reused for user-supplied content.
const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
    ));


export const passwordResetEmail = (token: string, email: string) => {
    const safeToken = escapeHtml(token);

    //Both values are encoded — an email address legitimately contains "+" and
    //other characters that would otherwise break the query string.
    const link = `${envConf.APP_RESET_URL}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
    const safeLink = escapeHtml(link);

    return {
        subject: 'Reset your Imara Afya password',
        //THE CODE IS IN THE TEXT AS WELL AS THE LINK, on purpose. A link is
        //useless if the mail was opened on a laptop, and some mail clients
        //refuse to make an app link tappable at all. Without the code those
        //people would be locked out with no way forward.
        body: [
            'We received a request to reset your Imara Afya password.',
            '',
            'Open this link on the phone with Imara Afya installed:',
            link,
            '',
            `Or enter this code in the app: ${token}`,
            '',
            'This code expires in 30 minutes and can only be used once.',
            'If you did not ask for this, you can ignore this message — nothing has changed.',
        ].join('\n'),
        //Inline styles and a table-free layout on purpose: mail clients strip
        //<style> blocks, and anything clever renders as a mess in Gmail.
        html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f1a16">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 16px">Reset your password</h1>
  <p style="font-size:15px;line-height:22px;margin:0 0 20px">
    We received a request to reset your Imara Afya password.
  </p>
  <a href="${safeLink}" style="display:block;background:#0a7d5a;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;text-align:center;padding:15px 20px;border-radius:14px;margin:0 0 20px">
    Set a new password
  </a>
  <div style="background:#f3f8f6;border-radius:14px;padding:20px;text-align:center;margin:0 0 20px">
    <div style="font-size:13px;color:#5c6b64;margin-bottom:8px">Or enter this code in the app</div>
    <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#0a7d5a">${safeToken}</div>
  </div>
  <p style="font-size:14px;line-height:21px;color:#5c6b64;margin:0 0 8px">
    This code expires in 30 minutes and can only be used once.
  </p>
  <p style="font-size:14px;line-height:21px;color:#5c6b64;margin:0">
    If you did not ask for this, you can ignore this message — nothing has changed.
  </p>
</div>`.trim(),
    };
};
