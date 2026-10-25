# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service for **1 million users**. This document sets out the requirements, the load estimate, the architecture and how requests flow through it.

## 1. Requirements

### Functional requirements
- Users can register and log in.
- Users can create, view, edit and delete their own notes (title up to 100 characters, optional body).
- Users can organise notes with tags and filter notes by tag.
- Users can search their notes by text.
- Users can only see their own notes.
- Notes are available from any device through the web app and the API.

### Non-functional requirements
- **Scalability:** supports 1 million registered users and can grow without a redesign.
- **Availability:** target of 99.9% uptime (about 9 hours of downtime per year at most), with no single point of failure.
- **Performance:** 95% of API requests answered in under 300 ms.
- **Durability:** a saved note is never lost, which needs backups and replicated storage.
- **Security:** HTTPS everywhere, hashed passwords, token authentication, and strict checks that a user only reaches their own data.
- **Consistency:** a user must see their own changes straight away; other views may be a few seconds out of date.
- **Maintainability:** stateless services and clear logs so the team can deploy and debug easily.

## 2. Load estimate for 1 million users

### Assumptions
- 1,000,000 registered users, **20% active each day** = **200,000 daily active users (DAU)**.
- Each active user loads their notes list **30 times per day** (reads) and creates, edits or deletes **5 notes per day** (writes).
- One day has 86,400 seconds. Peak traffic is **5×** the average.
- An average note, with its row overhead, takes about **2 KB** in the database.
- A year has 365 days. Backups and replicas are not included in the basic estimate.

### Calculations

| Measure | Working | Result |
|---------|---------|--------|
| Reads per day | 200,000 × 30 | 6,000,000 |
| Reads per second (average) | 6,000,000 ÷ 86,400 | **about 69 per second** |
| Reads per second (peak) | 69 × 5 | **about 347 per second** |
| Writes per day | 200,000 × 5 | 1,000,000 |
| Writes per second (average) | 1,000,000 ÷ 86,400 | **about 11.6 per second** |
| Writes per second (peak) | 11.6 × 5 | **about 58 per second** |
| New data per day | 1,000,000 × 2 KB | 2 GB |
| Storage per year | 2 GB × 365 | **about 730 GB (0.73 TB)** |

**Conclusion:** the system is **read-heavy**, with about 6 reads for every write. The storage is small (under 1 TB per year), so a single SQL primary database can hold it. The main reason for the extra servers, cache and replica is availability and fast reads, not raw size.

## 3. Architecture diagram

```
                         +----------------------+
                         |        Client        |
                         |  (browser / mobile)  |
                         +----------------------+
                           |         |         |
        1. look up address |         |         | 3. API calls (HTTPS)
                           v         |         v
                    +-----------+    |    +------------------+
                    |    DNS    |    |    |  Load Balancer   |
                    +-----------+    |    +------------------+
                                     |        |       |       |
                      2. static files|        v       v       v
                      (HTML/CSS/JS)  |   +--------+ +--------+ +--------+
                                     v   | App    | | App    | | App    |
                              +-----------+| Server | | Server | | Server |
                              |    CDN    || 1      | | 2      | | 3      |
                              +-----------++--------+ +--------+ +--------+
                                              |  |  \_____________|_______
                                              |  |                |       \
                                  +-----------+  +-------------+  |        \
                                  v                            v  v         v
                            +-----------+         +-------------------+  +---------+
                            |   Cache   |         |  Primary Database |  |  Queue  |
                            |  (Redis)  |         |  (all writes)     |  +---------+
                            +-----------+         +-------------------+       |
                                                         |  replication       v
                                                         v              +-----------+
                                                  +----------------+    |  Worker   |
                                                  |  Read Replica  |    | (several) |
                                                  |  (reads only)  |    +-----------+
                                                  +----------------+          |
                                                                              v
                                                                  updates search index,
                                                                  sends emails, cleans up
```

Reading the diagram:
- The client first asks **DNS** for the address, loads the static files from the **CDN**, and sends API calls to the **load balancer**.
- The load balancer sends each request to one of three **app servers**.
- App servers read from the **cache** first, then the **read replica**. They write to the **primary database** and put background jobs on the **queue** for the **workers**.

## 4. What each component does

- **Client:** shows the notes and sends requests, so users can use QuickNotes from any device.
- **DNS:** turns the name `api.quicknotes.example` into the address of the load balancer, so users never need to know server addresses and we can move servers without changing the name.
- **CDN:** keeps copies of the static files (HTML, CSS, JavaScript) in locations near users, which makes the app load fast and keeps that traffic away from our servers.
- **Load balancer:** spreads requests across the app servers and stops sending traffic to a server that is down, so no single server is overloaded or a single point of failure.
- **App servers (2 or more):** run the API logic (login, validation, creating and reading notes) and keep no data of their own, so we can add more of them as traffic grows.
- **Cache (Redis):** holds recently read note lists in memory, so repeated requests are answered in milliseconds and the database has less work to do.
- **Primary database:** the single place where writes happen, which keeps the data correct and consistent.
- **Read replica:** a live copy of the primary that answers read queries, so the many reads do not slow down writes, and it can take over if the primary fails.
- **Queue:** holds background jobs (such as "update the search index for note 42") so that the user's request can finish immediately instead of waiting for slow work.
- **Worker:** takes jobs from the queue and does them in the background, and we can add more workers if the queue grows.

## 5. Request flows

### `GET /notes` (list notes)

1. The client resolves `api.quicknotes.example` through **DNS** and sends `GET /v1/notes` with its token over HTTPS.
2. The **load balancer** picks a healthy **app server**.
3. The app server checks the token. If it is missing or invalid, it returns `401`.
4. The app server builds a cache key such as `notes:user:1:page:1` and looks in the **cache**.
5. **Cache hit:** the app server returns the cached list with `200 OK`. The flow ends here.
6. **Cache miss:** the app server queries the **read replica** for the user's notes (using the index on `user_id, created_at`).
7. The app server stores the result in the cache with a short expiry (for example 60 seconds).
8. The app server returns `200 OK` with the JSON list.

### `POST /notes` (create a note)

1. The client sends `POST /v1/notes` with its token and a JSON body, through DNS and the **load balancer** to an **app server**.
2. The app server checks the token (`401` if invalid).
3. The app server validates the body: the title must exist and be 100 characters or fewer, otherwise it returns `400`.
4. The app server inserts the note (and its tags) into the **primary database** in one transaction. If the database fails, it returns `500`.
5. The app server **deletes the cached lists** for this user (for example `notes:user:1:*`), so the next read shows the new note.
6. The app server puts a job on the **queue** ("index note 42").
7. The app server returns `201 Created` with the new note and a `Location` header. The user does not wait for the job.
8. The primary database copies the new row to the **read replica**.
9. A **worker** takes the job from the queue and updates the search index. If the job fails, it goes back on the queue and is retried.

## 6. Trade-offs

- **Cache: speed versus freshness.** The cache makes list requests very fast, but it can show slightly old data. We accept this for other views by using a short expiry, and we clear the user's cached lists after every write so that people see their own changes at once.
- **Read replica: read capacity versus consistency.** The replica handles the many reads, but it copies data a moment after the primary (replication lag). Right after creating a note, a read from the replica might not include it. To avoid this, the app reads from the primary for a short time after a user's own write.
- **Queue and worker: fast responses versus delayed work.** Creating a note feels instant, because slow tasks run in the background. The cost is that things like search results can lag by a few seconds, and we have to monitor the queue and retry failed jobs.
- **SQL primary: simplicity and correctness versus write scaling.** One primary database keeps the data correct and is simple to run, and our write load (about 58 per second at peak) is small enough for it. If writes ever outgrow one server, we can shard by `user_id`, but that makes the system more complex, so we postpone it until it is needed.
- **Redundancy: reliability versus cost.** Running several servers, a replica and spare capacity costs more than a single server, but it is what lets us reach 99.9% uptime.

## 7. Avoiding single points of failure

| Component | How a failure is avoided |
|-----------|--------------------------|
| DNS | Use a managed DNS service with several name servers in different locations. |
| CDN | A CDN is already spread across many locations around the world. |
| Load balancer | Run two load balancers (active and standby) or use a managed one that works across several data centres. |
| App servers | Run at least two, in different availability zones. They are stateless, so if one fails the load balancer sends traffic to the others. |
| Cache | Run Redis with a replica that takes over automatically. If the cache is lost, the app still works by reading from the database, only more slowly. |
| Primary database | Keep a replica that can be promoted to primary automatically, and take regular backups so data can be restored. |
| Read replica | Run more than one replica if needed. If one fails, reads can go to the other or to the primary. |
| Queue | Use a replicated, managed queue so jobs survive a server failure. |
| Workers | Run several workers. Failed jobs return to the queue and are retried by another worker. |

All of these are spread across at least two data centres (availability zones), so the loss of one building or power supply does not take QuickNotes offline.
