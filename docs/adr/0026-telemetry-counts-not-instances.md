---
status: accepted
---

# Telemetry counts pings, not instances

The plan makes telemetry opt-in and off by default, and limits its payload to the version and a user-count bucket, shown on the instance admin page exactly as sent. This ADR decides where that payload goes and what is kept of it.

**What an instance sends.** Once an instance admin turns telemetry on, the instance sends one ping a day: `{"version":"1.4.2","users":"2-10"}`. `users` is the number of users on the instance, as one of the buckets `1`, `2-10`, `11-50`, `51-200`, `201-1000` and `1001+`. The request is a `POST` with `Edict` as its user agent. It carries no instance id, no URL, no cookie and no other header the instance chooses. Turning telemetry off stops the next ping; nothing is sent while it is off.

**Where it goes.** To Edict's own collector at `https://telemetry.edict.dev/v1/ping`, a small service in this repository (`apps/telemetry`) that runs on the project's VPS through Dokploy, next to the docs site and the dogfood instance. No third party sees the pings.

**What is kept.** The collector keeps counts, not pings: one row per day, version and bucket, with how many pings arrived. It stores no IP address and no time finer than the day, and writes no request log. A ping cannot be told apart from another with the same version and bucket the same day, and nothing ties two days' pings to one instance. The daily counts by version and bucket are public at `GET /v1/stats`, since they say nothing about any one instance.

## Considered options

- **A third-party analytics service.** Nothing to run, but every ping would hand an outside company the instance's IP address, which the plan's narrow payload exists to avoid.
- **A collector route in the Edict server, on only for the dogfood instance.** Nothing new to deploy, but every self-hosted instance would ship code that only one uses, and the dogfood instance's database would hold other people's data.
- **An instance id, to count instances instead of pings.** More accurate, but the plan rules it out: an id links an instance's pings across days, which turns a count into a history.

## Consequences

- The numbers are estimates: an instance that is down for a day is missing from that day, and anyone can post a fake ping. They show which versions are in use and roughly how big instances are, which is all the payload can say anyway.
- The reverse proxy in front of the collector must not keep access logs, or the IP addresses the collector refuses to store end up on disk anyway.
