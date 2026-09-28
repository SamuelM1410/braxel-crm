# Gmail email marketing in Braxel

Braxel separates the first outreach from replies:

- A representative approves every first outbound message.
- Eve can reply automatically only inside an existing thread after the mailbox is connected.
- Eve pauses and creates a human-review note for opt-outs, complaints, prices, contracts, privacy, refunds, legal questions, or ambiguous requests.
- Every outbound marketing email carries List-Unsubscribe, List-Unsubscribe-Post, and a visible unsubscribe link.
- The unsubscribe endpoint writes to SuppressedContact. Future replies and filings skip suppressed addresses.
- Initial outreach has a conservative daily limit of 50 messages by default. Set GMAIL_MARKETING_DAILY_LIMIT only after reviewing deliverability.

## Production configuration

Set these variables in the API deployment:

    EMAIL_UNSUBSCRIBE_BASE_URL=https://braxel-api.vercel.app
    EMAIL_UNSUBSCRIBE_SECRET=<at least 32 random characters>
    GMAIL_MARKETING_DAILY_LIMIT=50

Use a stable secret. Rotating it invalidates existing unsubscribe links. Do not place secrets in
.env.example, source control, browser code, or message content.

## Operating sequence

1. Connect the Braxel Gmail account with gmail.send and the read/history scopes.
2. Configure SPF, DKIM, DMARC, and TLS for the sending domain.
3. Start with the default limit and send only to contacts with a lawful, documented basis.
4. Keep sender identity and the offer clear. Include a simple opt-out.
5. Review replies and handoffs each day. Increase volume only when spam complaints and bounces remain low.
6. Monitor Google Postmaster Tools and Gmail API quota responses.

Google requires authentication and good sending practices. Gmail's bulk-sender rules add DMARC
and one-click unsubscribe requirements at high volume. See the official
[sender guidelines](https://support.google.com/mail/answer/81126?hl=en-en),
[sender FAQ](https://support.google.com/mail/answer/14229414?hl=en), and
[bulk-sender best practices](https://support.google.com/mail/answer/10979322?hl=en).
The Gmail API documents its send quotas in the
[quota reference](https://developers.google.com/workspace/gmail/api/reference/quota).
