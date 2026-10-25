# QuickNotes Data Model

The SQL in this document uses SQLite syntax and runs in an SQLite playground. In PostgreSQL or MySQL, only small changes are needed (for example `SERIAL` or `AUTO_INCREMENT` instead of `AUTOINCREMENT`).

## Entities

### users
| Column | Type | Key / rules |
|--------|------|-------------|
| `id` | INTEGER | **Primary key** |
| `name` | VARCHAR(100) | NOT NULL |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE |
| `password_hash` | VARCHAR(255) | NOT NULL (never store the plain password) |
| `created_at` | TIMESTAMP | NOT NULL, default now |

### notes
| Column | Type | Key / rules |
|--------|------|-------------|
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users(id)`, NOT NULL |
| `title` | VARCHAR(100) | NOT NULL, length 1 to 100 |
| `body` | TEXT | optional |
| `created_at` | TIMESTAMP | NOT NULL, default now |
| `updated_at` | TIMESTAMP | NOT NULL, default now |

### tags
| Column | Type | Key / rules |
|--------|------|-------------|
| `id` | INTEGER | **Primary key** |
| `user_id` | INTEGER | **Foreign key** to `users(id)`, NOT NULL |
| `name` | VARCHAR(50) | NOT NULL, unique per user |

### note_tags (join table)
| Column | Type | Key / rules |
|--------|------|-------------|
| `note_id` | INTEGER | **Foreign key** to `notes(id)`, part of the composite primary key |
| `tag_id` | INTEGER | **Foreign key** to `tags(id)`, part of the composite primary key |

The composite primary key `(note_id, tag_id)` means the same tag cannot be attached to the same note twice.

## Relationships

- **users to notes is one-to-many.** One user can write many notes, but each note belongs to exactly one user (`notes.user_id`).
- **users to tags is one-to-many.** One user can create many tags, and each tag belongs to one user (`tags.user_id`).
- **notes to tags is many-to-many.** A note can have many tags (for example "work" and "urgent"), and a tag can be on many notes. A relational table cannot store a list in one column, so the `note_tags` join table holds one row for each (note, tag) pair. This turns the many-to-many relationship into two one-to-many relationships: notes to note_tags, and tags to note_tags.

When a user or a note is deleted, `ON DELETE CASCADE` removes the rows that depended on it, so no orphan rows are left behind.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      VARCHAR(100) NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body       TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name    VARCHAR(50) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id  INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);
```

## Indexes

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag_id ON note_tags (tag_id);
```

- **`idx_notes_user_created` on `notes(user_id, created_at DESC)`:** the most common query is "show this user's newest notes" (`GET /notes`). The index lets the database jump straight to one user's notes already sorted by date, instead of scanning every note of every user and sorting them. This matters when the table holds hundreds of millions of rows.
- **`idx_note_tags_tag_id` on `note_tags(tag_id)`:** the composite primary key already makes "find the tags of a note" fast, but "find the notes with a tag" starts from `tag_id`, so it needs its own index. Databases do not create indexes on foreign keys automatically.

## Example queries

Sample data used to check the queries: users 1 and 2; notes "Team meeting agenda" (tag work), "Buy milk" (tag personal) and "Revise SQL" (tags study and work) for user 1.

**1. The newest 10 notes of one user**

```sql
SELECT id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10;
```

**2. All notes with the tag "work" for one user (uses a JOIN)**

```sql
SELECT n.id, n.title
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 1
  AND t.name = 'work';
```

Result with the sample data: "Team meeting agenda" and "Revise SQL".

**3. How many notes each tag has (LEFT JOIN with GROUP BY, so unused tags show 0)**

```sql
SELECT t.name, COUNT(nt.note_id) AS note_count
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 1
GROUP BY t.id, t.name
ORDER BY note_count DESC;
```

Result with the sample data: work 2, personal 1, study 1.

**4. Search note titles**

```sql
SELECT id, title
FROM notes
WHERE user_id = 1
  AND title LIKE '%meeting%';
```

(`LIKE '%word%'` cannot use a normal index. For a very large system, a full-text search index would replace it.)

## SQL or NoSQL?

I choose a **SQL (relational) database** for QuickNotes. The data is clearly structured and connected: users own notes, and notes and tags have a many-to-many relationship. A relational database enforces these rules for us with foreign keys, `NOT NULL`, `UNIQUE` and `CHECK` constraints, so we cannot create a note for a user that does not exist or attach the same tag twice. Joins make questions like "all notes with a given tag" simple and correct, and transactions keep a change such as "create a note and attach its tags" all-or-nothing. A NoSQL document database could store each note with its tags inside one document, and it would make spreading data across many servers easier, but we would lose strong constraints and easy joins. For 1 million users the volume (hundreds of GB per year, see the architecture document) is well within what a single SQL primary database with read replicas can handle, and if it ever grows too large we can shard the data by `user_id`, because users never need to see each other's notes.
