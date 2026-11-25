# IDMatch / DVS research: verifying job seekers

Researched 25 Nov 2026. Sources are listed at the end. This is not legal advice. Before signing anything, run the conclusions past the IVS Manager (ivs.manager@ag.gov.au) and a privacy lawyer.

## TL;DR

- IDMatch is the government's Identity Verification Services (IVS) programme, run by the Attorney-General's Department (AGD). The part we'd use is the **Document Verification Service (DVS)**. It checks the details a person types in from a licence, passport, Medicare card or similar against the issuer's record. It only returns a yes or no (an "Information Match Result"). It does not return any document details or a photo.
- As a **Business User**, the DVS may only be used for **your own internal purposes**. The agreement also bans using it for anything connected with providing an "information service" to anyone else (clause 4.7(b), (d)). You can't pass the result on (4.9), and Business Users "must not provide an identity opinion to any third party". A "Verified" badge that salons rely on is close to all three of these lines.
- On "reasonable necessity", **pre-employment screening** appears in the list of uses likely to qualify. But that is the **employer's** use (the salon's), not ours. A job board checking IDs at sign-up looks more like "registering with a social network", which is in the list of uses **unlikely** to qualify.
- Cost: AGD's fee page lists a **one-off connection fee of about $25.5k + GST** for a non-government entity (a $24,641.40 base plus $454.55 per document type), then **$0.40 per check**. I couldn't confirm whether a Business User connecting through a gateway pays that base fee itself or whether it sits with the gateway. That's question 1 below.
- **Recommendation:** don't apply as a Business User yet. Become a client of an approved **Identity Service Provider (IDSP)**. An IDSP runs the DVS check (usually with a selfie or liveness check) and gives us an **identity opinion**, which is the output the framework allows to be shared with a client. Pre-employment identity proofing is the example AGD gives for IDSPs. We pay per check, with no AGD application, connection fee or annual compliance statement on our side. Only consider a direct Business User connection later, if volumes are high and AGD confirms in writing that our use case fits.

## How the DVS is structured

| Role | Who | Can see the DVS result | Can share with others |
|---|---|---|---|
| Business User | Private company verifying people for **its own** business | Yes | No result, no identity opinion (only with a lawful basis such as express consent, per the business user page) |
| Identity Service Provider (IDSP) | Verifies people **on behalf of clients** (e.g. pre-employment proofing) | Yes | Only an **identity opinion** ("likely who they say they are"), never the result |
| Gateway Service Provider (GSP) | The technical connection to the DVS hub. Everyone private goes through one | n/a | Can pass results to its authorised users |

Every private-sector connection goes through an approved GSP. There are about 40 of them, including Equifax, FrankieOne, GBG, IDVerse, Data Zoo, Trulioo, RapidID (Xref), InfoTrack, Cloudcheck, Martian Logic, WorkPro and **SEEK Pass**. SEEK being on the list shows a jobs company has gone the heavier GSP route.

There is also a commercial **Face Verification Service (FVS)**. It does a 1:1 match of a selfie against the passport or licence photo, also through a GSP, and businesses currently register interest for it. IDSP products usually wrap DVS and FVS (or their own liveness check) into one flow.

## Applying to become a Business User (the four steps)

1. **Meet the criteria** in the DVS Access Policy (v5.3, March 2026) and review the Business User Participation Agreement (27 Aug 2025).
2. **Nominate a GSP.** This is required before applying. In practice you sign the GSP's commercial service agreement too.
3. **Submit the DVS Online Registration Form** (a Noggin form), or email the paper form to ivs.manager@ag.gov.au with the subject "DVS Registration Application".
4. **Sign the participation agreement** that the IVS Manager sends and return it. A formal decision comes in **2–3 weeks**. The GSP also tells you whether you meet the criteria. You're bound from the date AGD tells you you're an "Approved Business User".

### What the form asks for

Legal entity name, ACN/ABN, physical and postal addresses, ANZSIC business type, nominated GSP and authorised representatives. For business type, employment services are ANZSIC division **N – Administrative and Support Services**.

The Access Guidelines (Part 4.3) say the application must also include:
- evidence that we're subject to a privacy law, or agree to comply with the Australian Privacy Principles (APPs), **including our privacy policy**
- the purpose of access, plus a **declaration of "reasonable necessity"** to use government identifiers
- **volume estimates**
- authority to enter the contract.

Applicable fees are paid at application and are non-refundable.

## What we'd need to do to be accepted

The IVS Advisory Board "in most cases" approves an application if all five criteria are met, fees are paid, and it has no "specific and material objection".

1. **Privacy law.** Companies with turnover under $3M usually aren't covered by the Privacy Act. In that case we have to agree by contract to comply with the APPs as if we were an APP entity. We'd need a proper APP-compliant privacy policy before applying. Note that SA and WA have no prescribed state privacy law.
2. **Based in Australia.** An Australian-incorporated company (Pty Ltd) is fine.
3. **Permitted to use government identifiers (APP 9.2).** This is the hard one. We have to show that a properly informed reasonable person would agree the check is *reasonably necessary* for **our** functions. Things that count against it:
   - other practical ways exist to verify identity
   - the function works without verifying identity
   - "registering with a social network" is listed as unlikely to qualify.

   Things that count for it:
   - the check protects us from identity crime
   - it's more privacy-friendly than the alternatives
   - we're licensed or regulated (we aren't).
4. **Connection** through an approved GSP.
5. **Capacity to comply:** collecting express consent, using the service only for the approved purpose, information security with logging and monitoring, annual compliance reporting, accepting independent audits, and appointing any **intermediary service providers** (anyone who sends, receives or stores the check data) as "Information Match Agents".

**Due diligence:** AGD checks with ASIC, ACMA and the OAIC that the business and its principals are of good standing. Things that can lead to an objection: unresolved privacy breaches, suspected unlawful activity, or someone in management not being "fit and proper".

## Ongoing obligations once approved

- **Consent before every check.** It has to be express, informed and opt-in, such as an unticked checkbox, and we keep a record of each consent. The model wording is: *"I confirm that I am authorised to provide the personal details presented and I consent to my information being checked with the document issuer or official record holder via third party systems for the purpose of confirming my identity."*
- **Before consent, tell the person:** how we use the DVS, our legal obligations, their rights, what happens if they decline, where to complain, and where to find information about the DVS hub. AGD publishes a Collection Notice Template we can adapt.
- **Treat everyone in the chain as an intermediary.** The categories of every intermediary involved must be disclosed to the person.
- **No secondary use** of ID data: no profiling, no marketing or advertising (ours or anyone else's), no market research.
- **No public statements about the DVS** without AGD approval (4.7(f)). So no "Government verified" marketing. Only the pre-approved collection-notice wording is allowed.
- **Annual self-audit** and a compliance statement signed by a senior person, even in a year with no checks. We may also be picked for the independent audit programme, which has 10-business-day deadlines for information requests.
- **Notify AGD:**
  - immediately for security breaches
  - before any access from overseas personnel or systems
  - 45 days before a change of control
  - if our use drifts from AGD's standard Privacy Impact Assessment (PIA). We'd then have to commission our own PIA.
- **Have a complaints process** for people whose ID information we hold.
- **Accept the termination terms.** AGD can suspend or terminate with 45 days' notice without cause, or immediately for a breach. We indemnify AGD.

## What this means for Salon Staff

- **Overseas access and our stack.** Cloudflare Workers run at edge locations worldwide. If we called the DVS ourselves, our hosting providers would count as intermediaries or overseas personnel and would need notifying. Using an IDSP's hosted flow (their SDK or redirect) keeps document data off our servers and avoids most of this. We'd store only their opinion, a reference ID and the date of the check.
- **Badge wording.** Use something like "ID checked", based on the IDSP's opinion. Don't say "verified by government" or "DVS verified", and never show 100% certainty.
- **Consent screen.** Use an unticked checkbox, link the collection notice and privacy policy, and say what happens if the person declines (they can still apply, just without the badge).
- **Apprentices.** People aged 15 or over can be presumed able to consent. Under 15 needs a parent or guardian. Build that into the age gate.
- **Don't keep document numbers** after the check.

## Questions to confirm before committing

1. **For AGD or a GSP:** does a Business User connecting through a GSP pay the ~$25.5k connection fee, or only GSP fees plus $0.40 per check? (The fee page also contradicts itself: $24,641.40 vs $24,610.40.)
2. **For AGD:** would a jobs marketplace checking candidates and showing employers an "ID checked" badge be allowed as a Business User at all? Or is that an "information service" or a disclosure to a third party (4.7(d), 4.9)?
3. **For shortlisted IDSPs:** their contracts say ID service clients must use the service "on their own behalf only" and not act as an "intermediary or reseller". Does showing a badge to salons fit that? Ask what they price per check, whether FVS or liveness is included, and where data is hosted.
4. **For a lawyer:** whether we should opt in to the Privacy Act. Having a privacy policy ready is needed either way.

## Provider shortlist

Researched 25 Nov 2026. Almost nobody publishes Australian prices. Any price below comes from a vendor's own marketing or a competitor's comparison page, so treat them as rough benchmarks until we have quotes.

What we need from a provider:
- a **hosted flow or SDK**, so document images and numbers never touch our Workers
- a **DVS check plus a selfie or liveness match**
- an **identity opinion** we can turn into an "ID checked" badge
- a **webhook** to tell us the outcome
- **Australian data hosting**
- **pay-per-check pricing** with no large annual minimum.

### Get quotes from these three

| Provider | Why it fits | Watch out for |
|---|---|---|
| **Persona** | Developer-friendly hosted flow and SDK with webhooks. Since Sept 2026 it sends Australian ID details to the DVS through **Data Zoo** (an approved gateway). It also integrates **ConnectID**, so job seekers could verify through their bank instead of uploading a licence. | US company: confirm where data is hosted and which party holds the participation agreement. No Australian price found. |
| **FrankieOne** | Melbourne-based, an approved gateway, and does identity orchestration. One API/SDK combines DVS, biometrics and 350+ other data sources. | Sales-led pricing aimed at fintech/KYC. One listing mentions a ~$30k enterprise licence, so ask about a small-volume tier. |
| **RapidID (Xref)** | An approved gateway with an open API. Its parent Xref already sells candidate identity checks to employers, so pre-employment use is familiar ground. | Pricing is demo/quote only. Check the selfie/biometric option and whether there's a hosted flow. |

### Also considered

- **ConnectID (Australian Payments Plus).** Government-accredited identity exchange where the bank shares verified details and nobody uploads documents. It works for CommBank, NAB, ANZ Plus and Westpac customers. Easiest to add through Persona (or Snapforms) rather than integrating directly (that needs FAPI OIDC certification). It doesn't cover people with other banks, so it's a second option alongside a document check, not a replacement. No public pricing.
- **WorkPro.** An approved gateway built for workforces. It combines DVS, face matching and **VEVO** work-rights checks into a portable "WorkPro ID" that workers can share with any employer on WorkPro. That's the closest existing match to "verified for employers". But it's an employer-side compliance platform, not something we can embed, so it's more a model to learn from (and a partner or competitor) than a vendor.
- **Equifax IDMatrix / GBG greenID.** Mature approved gateways with negotiated enterprise pricing. Competitor material says greenID has annual commitments and bills the shortfall if you check fewer people. Overkill at our size.
- **Data Zoo.** An approved gateway, but it supplies data only. The document capture and selfie would have to come from elsewhere (as Persona does).
- **IDVerse (LexisNexis).** Strong document plus deepfake-resistant biometrics. I found no confirmation it connects to the DVS. A competitor quotes an AWS listing of $35k for 25k checks over 12 months (~$1.40 each).
- **Didit.** Cheapest benchmark: full KYC with liveness at about US$0.33, and DVS checks at US$0.45. It is **not on AGD's approved gateway list**, and its pages describe returning "full-match data", which may be the raw result rather than an identity opinion. Only consider it if it shows which participation agreement our checks would run under.
- **Stripe Identity.** Available in Australia (€1.25/check in Ireland). Its docs don't mention the DVS, so it checks the document's authenticity, not the government record.
- **Cited (now CVCheck) / Martian Logic.** HR and recruitment platforms with identity and VEVO features. Not embeddable providers.

### Other things to keep in mind

- **The government Digital ID System opens to private businesses on 1 Dec 2026.** Businesses can apply to accept myID (and accredited private providers). myID fees apply from 1 Jan 2027 at the latest and aren't set yet (a 28-day consultation is due first). It's worth reapplying the shortlist here once fees are known. A "Sign in with myID to get the ID-checked badge" option could be cheap and well trusted.
- **Work rights (VEVO).** Many salon applicants are on visas. A VEVO check is a separate Home Affairs service, normally run by the employer with the worker's consent. If we ever want a "work rights checked" badge, look at it separately. WorkPro and Martian Logic show the pattern.

### Questions for every provider on the shortlist

1. Are you an **identity provider (IDSP)** or a gateway in this flow, and whose participation agreement do our checks run under? Do *we* need our own AGD registration or connection fee?
2. Do you return an **identity opinion** (not the raw DVS result)? Does your client contract let us show salons an "ID checked" badge based on it, given the "own behalf only, not an intermediary or reseller" rule for clients?
3. Is there a **hosted flow or SDK plus webhooks**? Which documents (licence for every state, passport, Medicare, ImmiCard, visa) and which liveness or face-match method?
4. **Where is data stored and processed**, how long do you keep it, and can we receive just the outcome and a reference?
5. **Price per completed check** at ~100, ~1,000 and ~10,000 a month. Any set-up fee, monthly minimum or annual commitment? Are failed or abandoned checks billed?
6. Is there **consent and collection-notice** wording we can reuse? How do you handle under-18s?
7. Do you support **ConnectID / myID** as an alternative to uploading documents?

## Sources

- [IDMatch – Business user](https://www.idmatch.gov.au/organisations/business-user)
- [IDMatch – Approved gateway service providers](https://www.idmatch.gov.au/organisations/business-user/approved-gateway-service-providers)
- [IDMatch – Identity service provider](https://www.idmatch.gov.au/organisations/identity-service-provider)
- [IDMatch – Deciding which DVS participation agreement to sign](https://www.idmatch.gov.au/organisations/deciding-which-dvs-participation-agreement-sign)
- [IDMatch – Identity Verification Services Fees](https://www.idmatch.gov.au/organisations/identity-verification-services-fees)
- [IDMatch – Consent obligations for private sector users](https://www.idmatch.gov.au/guidance-users/consent-obligations-private-sector-users)
- [IDMatch – Identity opinions](https://www.idmatch.gov.au/guidance-users/identity-opinions)
- [IDMatch – ID services and ID service clients](https://www.idmatch.gov.au/guidance-users/id-services-and-id-service-clients)
- [IDMatch – IVS compliance reporting](https://www.idmatch.gov.au/guidance-users/ivs-compliance-reporting)
- [IDMatch – DVS Independent Audit Program](https://www.idmatch.gov.au/guidance-users/dvs-independent-audit-program)
- [IDMatch – Overseas access](https://www.idmatch.gov.au/guidance-users/overseas-access)
- [IDMatch – What you need to notify us about](https://www.idmatch.gov.au/guidance-users/what-you-need-notify-us-about)
- [DVS Business User Participation Agreement (PDF)](https://www.idmatch.gov.au/system/files/2025-08/document-verification-service-business-user-participation-agreement.PDF)
- [Business User Manual Registration Form (PDF)](https://www.idmatch.gov.au/system/files/2024-04/idmatch_business-user-registration-form.PDF)
- [AGD – IVS access policies (DVS Access Policy v5.3, FVS commercial policy)](https://www.ag.gov.au/national-security/publications/identity-verification-service-access-policies)
- [Identity Verification Services Rules 2024 (fees, ss 8–9)](https://www.legislation.gov.au/F2024L00625/2025-06-07/2025-06-07/text/original/epub/OEBPS/document_1/document_1.html)
- [First Advantage – IDSP for candidate identity](https://fadv.com/en-au/news/first-advantage-strengthens-australian-identity-verification-capability-through-alignment-with-national-identity-verification-services-framework/)
- [Persona – Data Zoo and the Australian DVS (Sept 2026)](https://withpersona.com/blog/persona-data-zoo-australian-document-verification-service/)
- [FrankieOne AWS Marketplace listing](https://aws.amazon.com/marketplace/pp/prodview-rkjsmrzhw64ai) · [Didit vs FrankieOne (competitor page)](https://didit.me/blog/didit-vs-frankieone-comparison/)
- [Xref – RapidID integration](https://www.xref.com/integrations/rapidid) · [Xref – identity verification and DVS](https://xref.com/blog/identity-verification-and-document-verification-service)
- [ConnectID (AP+)](https://www.auspayplus.com.au/brands/connectid) · [Ping ConnectID connector (FAPI OIDC)](https://docs.pingidentity.com/connectors/connectid_connector.html)
- [WorkPro – Digital Identity Solution](https://www.workpro.com.au/Services/digital-identity-solution)
- [Equifax IDMatrix – DVS](https://equifax.com.au/idmatrix/node/74) · [Didit vs GBG greenID (competitor page)](https://didit.me/blog/didit-vs-gbg-greenid-comparison/)
- [Data Zoo pricing](https://datazoo.com/pricing) · [Data Zoo API](https://docs.datazoo.com/api)
- [LexisNexis – IDVerse](https://risk.lexisnexis.com/products/idverse) · [Didit vs IDVerse (competitor page)](https://didit.me/switch/idverse-alternative/)
- [Didit – Australia DVS](https://didit.me/solutions/countries/australia/)
- [Stripe Identity use cases and locations](https://docs.stripe.com/identity/use-cases)
- [CVCheck acquires Bright People Technologies (Cited)](https://cvcheck.com/articles/cvcheck-acquires-bright-people-technologies-as-part-of-strategic-evolution/) · [Martian Logic – working rights check](https://help.martianlogic.com/knowledge-base/how-to-request-a-working-rights-check)
- [Finance Minister – Digital ID expands to the private sector (June 2026)](https://ministers.finance.gov.au/financeminister/media-release/2026/06/26/digital-id-expands-private-sector) · [Policy settings for charging in AGDIS](https://www.digitalidsystem.gov.au/news/policy-settings-for-charging-and-user-choice-in-the-australian-government-digital-id-system) · [Mallesons – AGDIS private sector rollout](https://www.mallesons.com/au/en/insights/latest-thinking/new-rules-on-digital-id-herald-agdiss-private-sector-roll-out.html)
