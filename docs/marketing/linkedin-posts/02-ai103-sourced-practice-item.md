---
status: draft
post_id: p02
language: en
pillar: educational
scheduled_window: 2026-08-06T08:30:00+01:00
campaign: q3-2026-practice
ref: li-p02
utm_content: p02-ai103-managed-identity
cta_count: 1
cta_url: "https://examplar.app/exams/ai103/?ref=li-p02&utm_source=linkedin&utm_medium=organic&utm_campaign=q3-2026-practice&utm_content=p02-ai103-managed-identity"
sources:
  - "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-103"
  - "https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview-for-developers"
  - "https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/configure-entra-id"
---

# One AI-103 practice item, with its source

## Draft copy

One AI-103 practice item: the documentation behind it.

You deploy an AI application to Azure. It must call a Microsoft Foundry resource
without storing an API key in code or application settings.

Which approach best fits the requirement?

- A. Put the resource key in a client-side environment variable
- B. Use a managed identity with Microsoft Entra authentication and the required RBAC role
- C. Commit an encrypted key next to the application
- D. Allow anonymous access and restrict the endpoint by name

Best answer: B.

Managed identities let Azure workloads obtain tokens without developers handling
credentials in code. Microsoft also documents keyless Microsoft Entra
authentication for Foundry Models. This maps directly to the AI-103 objective
for securing AI systems with managed identity and keyless credentials.

This is an original practice item derived from public documentation.

Try the 10-question AI-103 diagnostic:
https://examplar.app/exams/ai103/?ref=li-p02&utm_source=linkedin&utm_medium=organic&utm_campaign=q3-2026-practice&utm_content=p02-ai103-managed-identity

#AI103 #MicrosoftFoundry #AzureAI #MicrosoftCertification

## Editorial notes

- The item is newly written for this post and is not copied from an Examplar
  pack or certification assessment.
- Keep “best answer” rather than implying that the distractors reproduce an
  official exam format.
- Keep the Microsoft URLs in front matter/editorial evidence rather than the
  post body so LinkedIn link engagements measure the Examplar destination.
