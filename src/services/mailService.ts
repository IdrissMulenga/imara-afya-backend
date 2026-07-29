import { envConf } from './../config/envConf.js';


//EMAIL DELIVERY — NOT CONNECTED TO A PROVIDER YET.
//
//The reset flow is complete on this side: a token is generated, hashed, stored
//with an expiry, and verified on use. The one missing piece is actually getting
//the token to the user's inbox, which needs an email provider (Resend, SES,
//Postmark, or SMTP) and credentials.
//
//Until that exists:
//  • development  — the reset link is printed to the server console so the flow
//                   can be tested end to end
//  • production   — sending fails loudly rather than pretending to have worked,
//                   because a reset the user never receives is worse than an
//                   honest error
//
//To finish this, replace the body of sendMail() with a provider call. Nothing
//else in the codebase needs to change.
type Mail = {
    to: string;
    subject: string;
    body: string;
};

export const isMailConfigured = () => false;

export const sendMail = async ({ to, subject, body }: Mail) => {
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

    //provider call goes here
};


export const passwordResetEmail = (token: string) => ({
    subject: 'Reset your Imara Afya password',
    body: [
        'We received a request to reset your Imara Afya password.',
        '',
        `Your reset code is: ${token}`,
        '',
        'This code expires in 30 minutes and can only be used once.',
        'If you did not ask for this, you can ignore this message — nothing has changed.',
    ].join('\n'),
});
